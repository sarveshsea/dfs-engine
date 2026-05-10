/**
 * Pure grading helpers for DFS bets — no I/O, no RN-only deps.
 *
 * Shared between the client orchestrator (dfs-settlement-service) and
 * the Deno settlement watcher edge function. The Deno copy lives at
 * supabase/functions/_shared/dfs-grading-pure.ts and must stay
 * functionally identical (types + payout schedule inlined there because
 * Deno can't reach into src/features/).
 *
 * Functions exported from here:
 *   - extractStatForProp(propType, league, entry) → numeric value | null
 *   - gradeLegFromActual(line, direction, actual) → 'won'|'lost'|'push'|'pending'
 *   - matchGameLogEntry(dateHint, entries) → PlayerGameLogEntryShape | null
 *   - computeBoostSplit({ ... }) → { total, withdrawable, bonus }
 *   - applyLegDnp({ ... }) → { updatedLegs, newMultiplier, isVoided, ... }
 *   - gradeDfsBetFromGraded({ ... }) → { status, multiplier, payouts }
 */
import { lookupStandardMultiplier, recalcMultiplierAfterDnp } from './payouts';
import { extractStatForPropViaRegistry } from './stat-adapters';
import type {
  DfsApp,
  DfsBetLeg,
  DfsBetPendingVerification,
  DfsLegStatus,
  DfsMidGameDnpEntry,
  DfsPayoutSplit,
  DfsPlayType,
} from './types';

/**
 * Multi-category stats — populated for sports whose gamelogs span
 * multiple stat groups per game (NFL today). Basketball / MLB entries
 * leave this undefined.
 */
export type PlayerGameLogCategoriesShape = {
  passing?: Record<string, string>;
  rushing?: Record<string, string>;
  receiving?: Record<string, string>;
  defensive?: Record<string, string>;
};

/**
 * MLB-specific peripherals not surfaced by the flat batter/pitcher
 * remap. Mirrors the NFL `categories` pattern — sport-specific extras
 * stay nested so the flat shape doesn't accumulate per-sport fields.
 *
 * Batter rows populate singles / doubles / triples / runs (singles is
 * computed in the parser as H − 2B − 3B − HR; ESPN doesn't surface 1B
 * directly). Pitcher rows populate pitchesThrown (parsed from PC-ST's
 * LHS, e.g. "95-62" → "95"). Either side leaves the other's keys
 * undefined; the adapter's role discriminator is what gates which keys
 * are read.
 *
 * Note on HBP: the PrizePicks Hitter FS formula references HBP, but
 * ESPN doesn't surface HBP at the per-game player level. The field is
 * intentionally absent from this shape — the formula reads
 * mlbExtras?.hbp, gets undefined, and returns null. PrizePicks Hitter
 * FS therefore stays gate-off-only until a feed onboards HBP. The
 * Underdog Fantasy Score formula (Total Bases) doesn't read HBP and
 * works once the gate flips.
 */
export type PlayerGameLogMlbExtrasShape = {
  singles?: string;
  doubles?: string;
  triples?: string;
  runs?: string;
  pitchesThrown?: string;
};

/**
 * Minimal shape of a per-game log entry that grading needs. Structurally
 * compatible with PlayerGameLogEntry from the gamelog service — keeping
 * this independent so the pure module never transitively imports RN deps.
 *
 * `mlbRole` is set by the parser on MLB entries based on the upstream
 * isMLBPitcher detection. MLB adapters dispatch on it so a "Walks"
 * (batter BB) leg never accidentally reads against a pitcher row's
 * remapped fields, and vice versa for "Walks Allowed" / "Hits Allowed"
 * / "Pitches Thrown". Non-MLB entries leave it undefined.
 */
export interface PlayerGameLogEntryShape {
  date: string;
  minutes: string;
  points: string;
  rebounds: string;
  assists: string;
  steals: string;
  blocks: string;
  turnovers: string;
  threeP: string;
  /**
   * Optional flat-field slots that the parser populates for sports
   * which need them. NHL skaters use fg=PPG, threeP=PPA so the
   * Power Play Points adapter sums them. Other sports leave these
   * undefined; adapters that don't need them ignore the field.
   */
  fg?: string;
  ft?: string;
  plusMinus?: string;
  categories?: PlayerGameLogCategoriesShape;
  mlbRole?: 'batter' | 'pitcher' | null;
  mlbExtras?: PlayerGameLogMlbExtrasShape;
  /**
   * NHL-only position discriminator. Same role as mlbRole — the parser
   * (or boxscore-shape adapter) sets it; per-prop NHL adapters guard on
   * it so Saves never reads against a skater row and Goals never reads
   * against a goalie row.
   */
  nhlPosition?: 'skater' | 'goalie' | null;
}

/**
 * Mirror of bet-service's BetStatus — duplicated to keep this module
 * dependency-free. Drift would be caught immediately at the type-check
 * boundary in dfs-settlement-service.ts and bet-service.ts (which both
 * import this).
 */
export type BetStatus = 'pending' | 'won' | 'lost' | 'void' | 'cashed_out' | 'pushed';

/* ────────────────────────────────────────────────────────────────────
 * extractStatForProp
 * ────────────────────────────────────────────────────────────────── */

/**
 * Map a DFS prop type string (verbatim from the slip) to the numeric
 * value to compare against the line. Returns null when the prop type
 * isn't supported by our gamelog source — those legs require manual
 * grading.
 *
 * Single-stage dispatch via the per-league adapter registry. Inputs
 * are normalised on write, so adapter lookups are exact-match against
 * canonical DfsPropTypeKey strings. Per-league tables live in
 * src/features/bets/dfs-stat-adapters/{basketball,nfl,mlb}.ts; new
 * props go in those tables and the canonical enum, never here.
 */
export function extractStatForProp(
  propType: string,
  league: string,
  entry: PlayerGameLogEntryShape,
  app: DfsApp,
): number | null {
  return extractStatForPropViaRegistry(propType, league, entry, app);
}

/* ────────────────────────────────────────────────────────────────────
 * detectMidGameDnp — Phase E.mid pure helper
 * ────────────────────────────────────────────────────────────────── */

export type MidGameDnpDecision = 'hard-flag' | 'soft-flag' | 'clear' | 'no-action';

/**
 * Parse ESPN's `MIN` field to a coarse minutes-played number.
 *
 * Shapes seen across ESPN's box-score endpoints:
 *   - "23:14"   → 23   (truncate seconds; coarse minutes are what we want)
 *   - "0"       → 0
 *   - "0:00"    → 0
 *   - "DNP"     → null
 *   - ""        → null
 *   - "-"/"—"   → null
 *
 * Returning null means "signal-less"; the detector treats null as
 * 'no-action' rather than guessing.
 */
function parseMinutesString(raw: string): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '-' || trimmed === '—') return null;
  if (/^DNP$/i.test(trimmed)) return null;
  if (trimmed.includes(':')) {
    const minPart = trimmed.split(':', 1)[0];
    const n = parseInt(minPart, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  const n = parseInt(trimmed, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Mid-game DNP detection rules (basketball-only, gated by the watcher's
 * league filter):
 *
 *   - 'hard-flag': MIN === 0 AND game past Q1 (period >= 2). Player
 *     hasn't seen the floor; the over is almost certainly cooked. The
 *     verify card surfaces "Looks like a DNP — mark or dismiss."
 *
 *   - 'soft-flag': MIN < 5 in Q4 (period >= 4). Played sparingly,
 *     possibly garbage time or load management. The card surfaces
 *     "Low minutes — verify if this counts."
 *
 *   - 'clear': MIN >= 5 at any time. Whatever was flagged before, the
 *     player is now playing — caller removes any existing entry.
 *
 *   - 'no-action': Q1, pre-game, post-game, or unparseable MIN. The
 *     watcher is being called every 5 minutes and we don't want a Q1
 *     sub rotation to flip the bet card.
 *
 * The watcher's view filter (`game_status='in_progress'`) gates this
 * to live games — we don't re-check `gameState` against a third source
 * of truth (leg.gameContext.state from parse-time would be stale).
 * `gameState` here is what the box-score's `state` field reports, the
 * server-side check that protects against between-tick state flips.
 */
export function detectMidGameDnp(opts: {
  minutesString: string;
  gameState: 'pre' | 'in' | 'post';
  period: number | null;
}): MidGameDnpDecision {
  if (opts.gameState !== 'in') return 'no-action';
  const minutes = parseMinutesString(opts.minutesString);
  if (minutes === null) return 'no-action';
  if (minutes >= 5) return 'clear';
  if (opts.period == null) return 'no-action';
  // Hard flag: zero floor time past Q1.
  if (minutes === 0 && opts.period >= 2) return 'hard-flag';
  // Soft flag: <5 minutes by Q4 (or OT). Hard flag takes precedence
  // when MIN is exactly 0; this branch covers 1..4 minutes.
  if (minutes < 5 && opts.period >= 4) return 'soft-flag';
  return 'no-action';
}

/* ────────────────────────────────────────────────────────────────────
 * reconcileMidGameDnpEntries — write-side state machine for the
 * watcher's per-tick pendingVerification update. Pure: takes the
 * existing JSONB + the per-leg detection results from this tick,
 * returns the next JSONB (or { changed: false } when nothing moved).
 *
 * Transitions per (decision, existing-entry):
 *
 *   hard-flag │ none                 → push {severity:'hard'}
 *   hard-flag │ soft (any dismiss)   → severity='hard', flaggedAt=now,
 *                                       dismissedAt=null (escalation
 *                                       re-prompts)
 *   hard-flag │ hard                 → no-op (dedupe)
 *   soft-flag │ none                 → push {severity:'soft'}
 *   soft-flag │ exists               → no-op (don't downgrade or
 *                                       refresh)
 *   clear     │ exists               → remove entry
 *   clear     │ none                 → no-op
 *   no-action │ *                    → no-op
 *
 * Stale entries (legs the watcher didn't process this tick — e.g. a
 * game that flipped to final between ticks) are preserved as-is. The
 * verify card filters them at render time on legStatus, and Phase C
 * grades them separately.
 * ────────────────────────────────────────────────────────────────── */

export function reconcileMidGameDnpEntries(opts: {
  existing: DfsBetPendingVerification | null;
  perLegDecisions: ReadonlyArray<{ legId: string; decision: MidGameDnpDecision }>;
  nowIso: string;
}): { next: DfsBetPendingVerification | null; changed: boolean } {
  const existing = opts.existing;
  const decisionsByLeg = new Map<string, MidGameDnpDecision>();
  for (const { legId, decision } of opts.perLegDecisions) {
    decisionsByLeg.set(legId, decision);
  }

  const startEntries: DfsMidGameDnpEntry[] = existing?.midGameDnp ?? [];
  const nextEntries: DfsMidGameDnpEntry[] = [];
  let changed = false;

  for (const entry of startEntries) {
    const decision = decisionsByLeg.get(entry.legId);
    if (decision === undefined) {
      // Watcher didn't see this leg this tick — preserve verbatim.
      nextEntries.push(entry);
      continue;
    }
    if (decision === 'clear') {
      changed = true; // entry dropped
      continue;
    }
    if (decision === 'hard-flag' && entry.severity === 'soft') {
      nextEntries.push({
        legId: entry.legId,
        severity: 'hard',
        flaggedAt: opts.nowIso,
        // Soft→hard escalation: clear any prior dismiss so the user
        // sees the re-prompt for the harder signal.
        dismissedAt: null,
      });
      changed = true;
      continue;
    }
    // hard-flag with severity='hard', soft-flag on any existing, or
    // no-action: pass through unchanged.
    nextEntries.push(entry);
  }

  // New entries for legs not previously flagged.
  const seenLegIds = new Set(startEntries.map((e) => e.legId));
  for (const { legId, decision } of opts.perLegDecisions) {
    if (seenLegIds.has(legId)) continue;
    if (decision === 'hard-flag' || decision === 'soft-flag') {
      nextEntries.push({
        legId,
        severity: decision === 'hard-flag' ? 'hard' : 'soft',
        flaggedAt: opts.nowIso,
        dismissedAt: null,
      });
      changed = true;
    }
  }

  if (!changed) return { next: existing, changed: false };

  return {
    next: {
      midGameDnp: nextEntries,
      lastFlaggedAt: opts.nowIso,
    },
    changed: true,
  };
}

/* ────────────────────────────────────────────────────────────────────
 * gradeLegFromActual
 * ────────────────────────────────────────────────────────────────── */

/**
 * Pure leg grader. Caller resolves the actual stat via extractStatForProp.
 *
 *   - line === actual is treated as PUSH (DFS slips use x.5 lines almost
 *     exclusively, so equality means OCR misread or the user typed an
 *     integer line manually).
 *   - actual === null returns 'pending'.
 */
export function gradeLegFromActual(
  line: number,
  direction: 'over' | 'under',
  actual: number | null,
): DfsLegStatus {
  if (actual == null) return 'pending';
  if (actual === line) return 'push';
  const overHit = direction === 'over' ? actual > line : actual < line;
  return overHit ? 'won' : 'lost';
}

/* ────────────────────────────────────────────────────────────────────
 * shouldRegradeLeg — outcome-based reconciliation predicate
 * ────────────────────────────────────────────────────────────────── */

/**
 * Decide whether the reconciliation cron (Phase G.write) should re-grade
 * a leg. We only act on stat corrections that flip the leg's status
 * (won ↔ lost ↔ push) — raw value drift that stays on the same side of
 * the line is ignored.
 *
 * Rationale: re-grading purely-numeric corrections would generate
 * notification churn and audit-log noise without changing money flow.
 * The leg's displayed actualValue may show a stale number on the bet
 * detail screen until a flip-worthy correction fires; that's an
 * acceptable trade for the noise reduction.
 *
 * Inputs:
 *   - oldActual: the value we graded against (leg.gradingSnapshot.actualValue)
 *   - newActual: the value ESPN currently reports (this tick's fetch)
 * Returns false if either is null, if they're equal, or if their
 * resulting legStatus matches.
 */
export function shouldRegradeLeg(opts: {
  line: number;
  direction: 'over' | 'under';
  oldActual: number | null;
  newActual: number | null;
}): boolean {
  if (opts.oldActual == null || opts.newActual == null) return false;
  if (opts.oldActual === opts.newActual) return false;
  const oldStatus = gradeLegFromActual(opts.line, opts.direction, opts.oldActual);
  const newStatus = gradeLegFromActual(opts.line, opts.direction, opts.newActual);
  return oldStatus !== newStatus;
}

/* ────────────────────────────────────────────────────────────────────
 * matchGameLogEntry
 * ────────────────────────────────────────────────────────────────── */

const GAMELOG_WINDOW_MS = 36 * 60 * 60 * 1000;
const GAMELOG_AMBIGUITY_MS = 12 * 60 * 60 * 1000;

/**
 * Find every gamelog entry plausibly matching a leg's bet date. Used by
 * the watcher to detect doubleheader-style ambiguity (MLB primarily).
 *
 * Window: ±`opts.window` around `legGameDateHint` (defaults to
 * GAMELOG_WINDOW_MS = ±36h). The watcher tightens to ±12h when a leg's
 * `linkage.gameStartsAt` is known so a futures-style placed_at can't
 * pull in the wrong day's gamelog entry. Sort: forward-bias (entries
 * after the hint come first, since users place bets before tipoff),
 * then by absolute proximity. The forward-bias matters when a player
 * has back-to-back games — the upcoming one is the bet target, the
 * just-played one is just chronologically close.
 *
 * Ambiguity rule: if the top two candidates are within
 * GAMELOG_AMBIGUITY_MS of each *other* (not of the dateHint), both are
 * returned. This catches doubleheaders where two entries land on the
 * same calendar date hours apart and a clean pick would be a guess.
 *
 * Return semantics:
 *   - []                 → no entry in window (game hasn't been played yet)
 *   - [a]                → unambiguous match
 *   - [a, b]             → ambiguous; caller should defer or surface picker
 */
export function findGameLogCandidates<T extends PlayerGameLogEntryShape>(
  legGameDateHint: string | null,
  entries: T[],
  opts: { window?: number } = {},
): T[] {
  if (entries.length === 0) return [];
  if (!legGameDateHint) return [entries[0]];

  const target = new Date(legGameDateHint).getTime();
  if (!Number.isFinite(target)) return [entries[0]];

  const windowMs = opts.window ?? GAMELOG_WINDOW_MS;
  const scored: { entry: T; delta: number; signed: number }[] = [];
  for (const entry of entries) {
    const t = new Date(entry.date).getTime();
    if (!Number.isFinite(t)) continue;
    const signed = t - target;
    const delta = Math.abs(signed);
    if (delta > windowMs) continue;
    scored.push({ entry, delta, signed });
  }
  if (scored.length === 0) return [];

  scored.sort((a, b) => {
    const aAfter = a.signed >= 0;
    const bAfter = b.signed >= 0;
    if (aAfter !== bAfter) return aAfter ? -1 : 1;
    return a.delta - b.delta;
  });

  if (scored.length >= 2) {
    const topT = new Date(scored[0].entry.date).getTime();
    const secondT = new Date(scored[1].entry.date).getTime();
    if (Math.abs(topT - secondT) < GAMELOG_AMBIGUITY_MS) {
      return [scored[0].entry, scored[1].entry];
    }
  }
  return [scored[0].entry];
}

/**
 * Pick the gamelog entry that best matches a leg's bet date. ±36h
 * window. Returns null when nothing matches; on ambiguity returns the
 * forward-biased closest. Watchers should prefer `findGameLogCandidates`
 * so they can detect ambiguity and defer; this helper is for callers
 * (verifyDfsBet's legacy path, tests) that just want a single answer.
 */
export function matchGameLogEntry<T extends PlayerGameLogEntryShape>(
  legGameDateHint: string | null,
  entries: T[],
): T | null {
  const candidates = findGameLogCandidates(legGameDateHint, entries);
  return candidates[0] ?? null;
}

/* ────────────────────────────────────────────────────────────────────
 * computeBoostSplit
 * ────────────────────────────────────────────────────────────────── */

/**
 * PrizePicks: bonus is always 0 — withdrawable equals total.
 *
 * Underdog: split logic (in priority order):
 *   1. If baseMultiplier is supplied and the displayed multiplier exceeds
 *      it, bonus = stake × (multiplier - baseMultiplier).
 *   2. Otherwise fall back to the documented profit-boost formula:
 *      bonus = (winnings - stake) × profit_boost_pct.
 *   3. If neither is known, treat as no boost.
 */
export function computeBoostSplit(opts: {
  app: DfsApp;
  totalPayout: number;
  stake: number;
  multiplier: number;
  baseMultiplier?: number | null;
  profitBoostPct?: number | null;
}): DfsPayoutSplit {
  const total = Math.max(0, opts.totalPayout);
  if (opts.app === 'prizepicks' || total <= 0) {
    return { total, withdrawable: total, bonus: 0 };
  }
  let bonus = 0;
  if (opts.baseMultiplier != null && opts.baseMultiplier > 0 && opts.multiplier > opts.baseMultiplier) {
    bonus = opts.stake * (opts.multiplier - opts.baseMultiplier);
  } else if (opts.profitBoostPct != null && opts.profitBoostPct > 0 && total > opts.stake) {
    bonus = (total - opts.stake) * opts.profitBoostPct;
  }
  bonus = Math.min(Math.max(0, bonus), total);
  bonus = Math.round(bonus * 100) / 100;
  const withdrawable = Math.round((total - bonus) * 100) / 100;
  return { total, withdrawable, bonus };
}

/* ────────────────────────────────────────────────────────────────────
 * applyLegDnp
 * ────────────────────────────────────────────────────────────────── */

/**
 * Mark a single leg as DNP and return the new bet shape (legs + multiplier
 * + potential payout). Pure: caller persists the result.
 *
 * Mirrors bet-service.ts:markLegDnp's transition logic so the Deno
 * settlement watcher's pre-game DNP path produces the same column writes
 * as the RN UI's manual DNP override. The actual void column values
 * (status='void', actual_payout=stake, etc.) are applied by the caller
 * when isVoided=true — see bet-service.ts:399-433.
 *
 * MAINTAINED PAIR: applyLegDnp (this file, used by the Deno watcher) and
 * markLegDnp (bet-service.ts, used by the RN UI) implement the same
 * transition twice. Future cleanup: extract computeDnpTransition that
 * returns the full intended column-write object so both call sites
 * collapse to thin transport wrappers. The void-branch contract pin in
 * tests/unit/lib/dfs-pregame-dnp.test.ts catches drift between the two.
 *
 * KNOWN LIMITATION: passing currentMultiplier (post-prior-DNP) instead
 * of the slip's original placed multiplier is mathematically equivalent
 * by chain rule — recalc results match across multi-DNP modulo 4-decimal
 * rounding. The semantic loss is the link back to slip-at-placement,
 * which becomes load-bearing for Wave 4 G.write (stat-correction reversal
 * needs to recompute from original) and dispute explainability. Fix:
 * persist slip_original_multiplier at create time, immutable; multiplier
 * remains current state. Deferred until reconciliation forces the issue.
 *
 * Idempotency: if the target leg is already 'dnp', returns alreadyDnp=true
 * and the caller should skip writes.
 *
 * Caller is responsible for:
 *   - Re-asserting bet status='pending' in the WHERE clause to guard
 *     against manual-override races.
 *   - Writing the void columns when isVoided=true.
 *   - Writing the post-DNP grading-snapshot/log row.
 */
export function applyLegDnp<L extends { legId: string; legStatus: DfsLegStatus }>(opts: {
  app: DfsApp;
  playType: DfsPlayType;
  legs: L[];
  legIdToMark: string;
  stake: number;
  /** bet.multiplier as currently stored — passed straight to recalcMultiplierAfterDnp. */
  currentMultiplier: number;
}): {
  updatedLegs: L[];
  alreadyDnp: boolean;
  notFound: boolean;
  isVoided: boolean;
  newMultiplier: number;
  newPotentialPayout: number;
} {
  const target = opts.legs.find((l) => l.legId === opts.legIdToMark);
  if (!target) {
    return {
      updatedLegs: opts.legs,
      alreadyDnp: false,
      notFound: true,
      isVoided: false,
      newMultiplier: opts.currentMultiplier,
      newPotentialPayout: 0,
    };
  }
  if (target.legStatus === 'dnp') {
    return {
      updatedLegs: opts.legs,
      alreadyDnp: true,
      notFound: false,
      isVoided: false,
      newMultiplier: opts.currentMultiplier,
      newPotentialPayout: 0,
    };
  }

  const updatedLegs = opts.legs.map((leg) =>
    leg.legId === opts.legIdToMark ? { ...leg, legStatus: 'dnp' as DfsLegStatus } : leg,
  );
  const survivingLegs = updatedLegs.filter((leg) => leg.legStatus !== 'dnp');
  const survivingHits = survivingLegs.filter((leg) => leg.legStatus === 'won').length;
  const originalPickCount = opts.legs.length;
  const survivingPickCount = survivingLegs.length;

  if (survivingPickCount < 1) {
    return {
      updatedLegs,
      alreadyDnp: false,
      notFound: false,
      isVoided: true,
      newMultiplier: 0,
      newPotentialPayout: 0,
    };
  }

  const recalc = recalcMultiplierAfterDnp({
    app: opts.app,
    playType: opts.playType,
    originalPickCount,
    survivingPickCount,
    survivingHits,
    originalMultiplier: opts.currentMultiplier,
  });
  const newMultiplier = recalc.newMultiplier;
  const newPotentialPayout =
    Number.isFinite(opts.stake) && opts.stake > 0 && newMultiplier > 0
      ? Math.round(opts.stake * newMultiplier * 100) / 100
      : 0;

  return {
    updatedLegs,
    alreadyDnp: false,
    notFound: false,
    isVoided: false,
    newMultiplier,
    newPotentialPayout,
  };
}

/* ────────────────────────────────────────────────────────────────────
 * gradeDfsBetFromGraded
 * ────────────────────────────────────────────────────────────────── */

/**
 * Roll graded legs into bet status + payout split. Power plays are
 * all-or-nothing; Flex plays look up the standard multiplier and scale
 * the slip's displayed multiplier proportionally so any boost flows
 * through to the demoted payout.
 *
 * Pending semantics:
 *   - Any 'pending' surviving leg → bet stays 'pending'.
 *   - 'dnp' legs are filtered out before counting (caller should have
 *     already recomputed multiplier via markLegDnp).
 */
export function gradeDfsBetFromGraded(opts: {
  app: DfsApp;
  playType: DfsPlayType;
  legs: DfsBetLeg[];
  stake: number;
  /** Slip-displayed multiplier — used for Power; for Flex we look up the schedule. */
  displayedMultiplier: number;
  baseMultiplier: number | null;
  profitBoostPct: number | null;
}): {
  status: BetStatus;
  effectiveMultiplier: number;
  totalPayout: number;
  withdrawablePayout: number;
  bonusPayout: number;
} {
  const surviving = opts.legs.filter((leg) => leg.legStatus !== 'dnp');
  const survivingCount = surviving.length;
  const wonCount = surviving.filter((leg) => leg.legStatus === 'won').length;
  const lostCount = surviving.filter((leg) => leg.legStatus === 'lost').length;
  const pendingCount = surviving.filter((leg) => leg.legStatus === 'pending').length;

  if (pendingCount > 0) {
    return {
      status: 'pending',
      effectiveMultiplier: opts.displayedMultiplier,
      totalPayout: 0,
      withdrawablePayout: 0,
      bonusPayout: 0,
    };
  }

  const isPower = opts.playType === 'power' || opts.playType === 'underdog_standard';
  if (isPower) {
    if (lostCount > 0) {
      return {
        status: 'lost',
        effectiveMultiplier: opts.displayedMultiplier,
        totalPayout: 0,
        withdrawablePayout: 0,
        bonusPayout: 0,
      };
    }
    const totalPayout = Math.round(opts.stake * opts.displayedMultiplier * 100) / 100;
    const split = computeBoostSplit({
      app: opts.app,
      totalPayout,
      stake: opts.stake,
      multiplier: opts.displayedMultiplier,
      baseMultiplier: opts.baseMultiplier,
      profitBoostPct: opts.profitBoostPct,
    });
    return {
      status: 'won',
      effectiveMultiplier: opts.displayedMultiplier,
      totalPayout: split.total,
      withdrawablePayout: split.withdrawable,
      bonusPayout: split.bonus,
    };
  }

  const standard = lookupStandardMultiplier({
    app: opts.app,
    playType: opts.playType,
    pickCount: survivingCount,
    hits: wonCount,
  });
  if (standard == null || standard <= 0) {
    return {
      status: 'lost',
      effectiveMultiplier: 0,
      totalPayout: 0,
      withdrawablePayout: 0,
      bonusPayout: 0,
    };
  }
  const standardForOriginal = lookupStandardMultiplier({
    app: opts.app,
    playType: opts.playType,
    pickCount: survivingCount,
    hits: survivingCount,
  });
  const effectiveMultiplier =
    standardForOriginal && standardForOriginal > 0
      ? Math.round((opts.displayedMultiplier * (standard / standardForOriginal)) * 10000) / 10000
      : standard;
  const totalPayout = Math.round(opts.stake * effectiveMultiplier * 100) / 100;
  const split = computeBoostSplit({
    app: opts.app,
    totalPayout,
    stake: opts.stake,
    multiplier: effectiveMultiplier,
    baseMultiplier: opts.baseMultiplier,
    profitBoostPct: opts.profitBoostPct,
  });
  return {
    status: totalPayout > 0 ? 'won' : 'lost',
    effectiveMultiplier,
    totalPayout: split.total,
    withdrawablePayout: split.withdrawable,
    bonusPayout: split.bonus,
  };
}
