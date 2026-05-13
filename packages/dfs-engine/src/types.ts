/**
 * DFS (PrizePicks + Underdog) types - shared across the bet service,
 * vision pipeline parsers, AddBetSheet, settlement watcher, and bet
 * detail rendering.
 *
 * Design notes:
 *
 *  - A DFS bet is *always* stored as one `bets` row with `legs` populated,
 *    even when there's only one leg. This keeps the wire format and grading
 *    code uniform between single and multi-leg picks.
 *
 *  - The displayed multiplier on the slip already includes any active
 *    profit boost. We store it as-is in `multiplier` and capture the boost
 *    percentage separately so the payout split (Underdog withdrawable vs
 *    bonus cash) can be computed without reverse-engineering the multiplier.
 *
 *  - DNP / push handling lives inside each leg's `legStatus`. When a leg
 *    is marked `dnp`, bet-service recomputes the multiplier from the
 *    payout reference table (e.g. PrizePicks 6-pick → 5-pick demotion).
 *
 *  - Linkage to internal player_id / game_id is best-effort for v1.
 *    Parsers store the OCR strings (`playerName`, `gameContext.*Team`)
 *    and a fuzzy match populates `playerAthleteId` / `gameId` when found.
 */

/**
 * Telemetry attached to a server-assisted slip parse — provider path,
 * model used, cache-hit flag, cost estimate, and any reviewer-side flags.
 * Optional on every consumer; populated by your vision/OCR pipeline if
 * you have one, ignored otherwise.
 *
 * Originally Buzzr-internal; inlined here so the package is standalone.
 * `BetslipParseProvider` is loose `string` so callers can record whatever
 * provider names they use.
 */
export type BetslipParseProvider = string;

export type BetslipParseMeta = {
  reviewFlags: string[];
  providerPath: BetslipParseProvider[];
  modelUsed: string | null;
  cacheHit: boolean;
  costEstimateMicros: number;
};

export type DfsApp = 'prizepicks' | 'underdog';

/**
 * Play tiers per app:
 *   - PrizePicks: 'power' (all legs must hit, max payout) or 'flex'
 *     (consolation payouts on partial hits, lower ceilings).
 *   - Underdog:   'underdog_standard' (all-or-nothing) or 'underdog_flex'
 *     (partial-hit consolation; Underdog calls these "Standard" and
 *     "Flex" but we prefix to disambiguate from PrizePicks).
 */
export type DfsPlayType = 'power' | 'flex' | 'underdog_standard' | 'underdog_flex';

/**
 * Per-leg status. 'pending' is the initial state for a leg before its
 * game ends. 'dnp' applies when a player did not play; the bet's
 * multiplier is recomputed and the leg is excluded from grading.
 */
export type DfsLegStatus = 'pending' | 'won' | 'lost' | 'push' | 'dnp';
export type DfsSettlementSource = 'scan' | 'stats' | 'manual' | 'provider';
export type DfsInitialBetStatus = 'pending' | 'won' | 'lost' | 'void' | 'pushed';
export type DfsSettlementPendingReason =
  | 'missing_player_link'
  | 'missing_game_link'
  | 'game_not_final'
  | 'stats_missing'
  | 'stat_unsupported';

/**
 * PrizePicks-specific leg modifier shown via emoji on the slip:
 *   - 'demon'   (😈) - harder line, larger payout contribution
 *   - 'goblin'  (🤑) - easier line, smaller payout contribution
 *   - 'standard' - no modifier
 * Underdog has no equivalent in the layouts we parse today.
 */
export type DfsBoostType = 'standard' | 'demon' | 'goblin';

/**
 * Game context attached to each leg. We try to normalize team names but
 * also keep the raw OCR string in `raw` for round-trip + debugging.
 */
export type DfsLegGameContext = {
  raw: string; // "Celtics 128 @ 76ers 96 • Final" or "Timberwolves @ Spurs – 8:30pm"
  homeTeam: string | null; // "76ers" or "Spurs"
  awayTeam: string | null; // "Celtics" or "Timberwolves"
  homeScore: number | null;
  awayScore: number | null;
  /** 'pre' (game not started) | 'live' (in progress) | 'final' */
  state: 'pre' | 'live' | 'final';
  /** Live clock when state='live' (e.g. "Q1 1:19", "1st 00:01"). */
  clock: string | null;
  /** Pre-game start time string when state='pre' (e.g. "8:30pm"). */
  startTime: string | null;
  /** Internal games.id, populated when fuzzy-matched. */
  gameId: string | null;
  /** Calendar date the game falls on, "YYYY-MM-DD". Derived by walking the slip's
   *  day-of-week forward from the placed_at date when present. NULL when the
   *  parser couldn't infer a day-of-week. */
  gameDate: string | null;
  /** Game tipoff time as 24h "HH:MM" parsed from the slip header (e.g. "18:00"
   *  for "6pm", "20:40" for "8:40pm"). NULL when not extractable. */
  gameStartTime: string | null;
  /** Three-letter day abbreviation as parsed from the slip ("Thu", "Fri").
   *  NULL when missing. */
  dayOfWeek: string | null;
  /** Two-letter US state code from slip metadata (e.g. "TX", "NY"), if present. */
  stateCode: string | null;
};

export type DfsBetLeg = {
  /** Stable id within a bet - used for DNP edits. */
  legId: string;
  playerName: string;
  playerTeam: string | null; // "WAS"
  playerPosition: string | null; // "WR", "C-F"
  playerNumber: string | null; // "#1", "#85"
  /** Internal players.id when matched. Plain-string fallback otherwise. */
  playerAthleteId: string | null;
  /**
   * Resolution metadata for the player. Populated by dfs-linkage-service
   * after parse / manual entry. The settlement watcher only auto-grades
   * legs whose linkage.status === 'resolved'; ambiguous and unmatched
   * legs surface a verification prompt to the user before grading.
   *
   * Lives alongside playerAthleteId for backwards compatibility — when
   * status === 'resolved', playerAthleteId is also set to the chosen
   * athlete's id.
   */
  linkage: LegLinkage | null;
  /** "Points", "Rebounds", "Rec Yards", "Pts + Rebs + Asts" — verbatim from slip. */
  propType: string;
  line: number;
  /** DFS slips show ↑ = over for nearly all lines; we still capture it for under-DFS markets. */
  direction: 'over' | 'under';
  league: string; // "NBA", "NFL", "MLB", "WNBA"
  gameContext: DfsLegGameContext;
  /**
   * Final stat after the game. Populated by the settlement watcher (or
   * read directly from a settled-state screenshot when the user uploads
   * post-game). NULL while pending.
   */
  actualValue: number | null;
  legStatus: DfsLegStatus;
  settlementPendingReason?: DfsSettlementPendingReason | null;
  /** PrizePicks-only - Underdog parsers always emit 'standard'. */
  boostType: DfsBoostType;
  /**
   * In-progress fingerprint refreshed every tick by the live watcher
   * (Phase D). Mirrors leg.actualValue at the moment of the last
   * polled stat update; lastLiveStatAt advances only when actualValue
   * actually changes (diff-based writes). Cleared (null) when the
   * settlement watcher grades the leg — gradingSnapshot becomes the
   * authoritative record from then on.
   */
  liveSnapshot: LegLiveSnapshot | null;
  /**
   * Audit snapshot captured the moment the settlement watcher graded
   * this leg. Used by the dispute path (Phase G) and by reconciliation
   * crons that re-check stat-correction windows. NULL while pending.
   */
  gradingSnapshot: LegGradingSnapshot | null;
};

/**
 * Live in-game snapshot. Written by bet-dfs-live-watcher on each tick
 * where the polled actual value differs from the stored one. NULL while
 * the leg is pre-game, after the leg is graded, or after a manual DNP.
 *
 * Read by the bet detail screen to render "currently 14 PTS" next to a
 * pending leg's line. The canonical value is leg.actualValue — this
 * struct only carries the freshness metadata (timestamp + source).
 */
export type LegLiveSnapshot = {
  /** Mirror of leg.actualValue at the moment of the last live poll. */
  actualValue: number;
  /** ISO timestamp of the most recent poll where actualValue changed. */
  lastLiveStatAt: string;
  /** Where the live value was sourced from. */
  source: 'espn-summary' | 'espn-boxscore';
};

/**
 * Bet-level UI signal for legs requiring user attention. Phase E.mid
 * populates `midGameDnp` from the live watcher; the verify card on bet
 * detail surfaces a row per entry whose `dismissedAt` is null.
 *
 * Linkage-issue legs (ambiguous / unmatched player resolution) are NOT
 * carried here — the verify card derives them from leg.linkage at read
 * time, single source of truth.
 *
 * Stored as bets.pending_verification jsonb. NULL until first flag.
 */
export type DfsMidGameDnpEntry = {
  legId: string;
  /** 'hard' = past Q1 with 0 minutes; 'soft' = Q4 with <5 minutes. */
  severity: 'hard' | 'soft';
  /** ISO; refreshes when the entry's severity changes (soft → hard). */
  flaggedAt: string;
  /**
   * ISO when the user explicitly dismissed the prompt. Watcher leaves
   * dismissed entries alone unless severity escalates from soft to hard
   * (the situation got materially worse — re-prompt is justified).
   * NULL while the prompt is still actionable.
   */
  dismissedAt: string | null;
};

export type DfsBetPendingVerification = {
  midGameDnp: DfsMidGameDnpEntry[];
  /** ISO; refreshes whenever the watcher changes the array shape. */
  lastFlaggedAt: string;
};

/**
 * Linkage status for a parsed leg's player.
 *
 *   - 'resolved'   — single high-confidence match; playerAthleteId is set,
 *                    leg is eligible for auto-grading.
 *   - 'ambiguous'  — multiple plausible candidates; user needs to pick one.
 *                    `candidates` is populated. `playerAthleteId` is null.
 *   - 'unmatched'  — no candidate cleared the confidence floor. The user
 *                    can search and pick from the confirmation screen.
 *   - 'pending'    — resolver hasn't run yet (e.g. manual-entry leg before
 *                    the user finished typing). UI treats this like 'unmatched'
 *                    but suppresses the warning chrome until first resolution.
 *   - 'manual'     — user explicitly bypassed the resolver (typed an
 *                    athleteId override). Eligible for auto-grading.
 */
export type LegLinkageStatus = 'resolved' | 'ambiguous' | 'unmatched' | 'pending' | 'manual';

export type PlayerCandidate = {
  athleteId: string;
  name: string;
  team: string | null;
  league: string;
  /**
   * 0..1 score from the fuzzy matcher. Populated only when the candidate
   * came out of name-similarity scoring; null for ESPN-API single-result
   * resolutions and for manual overrides.
   */
  confidence: number | null;
  /** Where the candidate came from (debug + audit). */
  source: 'directory' | 'espn-api' | 'manual';
};

export type LegLinkage = {
  status: LegLinkageStatus;
  /**
   * The chosen athleteId once resolved. Mirrors `leg.playerAthleteId` —
   * the leg-level field stays as a denormalized convenience for the
   * settlement watcher path (which only reads `playerAthleteId`),
   * while this field is the canonical resolver output. NULL when
   * status === 'ambiguous' / 'unmatched' / 'pending'.
   */
  resolvedAthleteId: string | null;
  /** Display name attached to the resolved athlete, or NULL while unresolved. */
  resolvedName: string | null;
  /** Candidate set surfaced to the user. Empty when status === 'resolved' or 'manual'. */
  candidates: PlayerCandidate[];
  /** ISO timestamp of the most recent resolver run for this leg. */
  resolvedAt: string;
  /** Where the resolved athleteId came from. */
  source: 'directory' | 'espn-api' | 'manual' | null;
  /**
   * Game-id linkage. Populated by `resolveLegGame` against the public.games
   * table on team+date+league match. NULL when the game can't be located —
   * settlement still works without it (we fall back to the player's gamelog
   * entries by date), but linking enables reactive UI on game state changes.
   */
  gameId: string | null;

  /**
   * Calendar date of the game in the league's local timezone, e.g.
   * "2026-05-07". Set from slip text ("Thu, 6pm" → next Thursday in
   * device TZ) or from a user-supplied date picker. Anchors the
   * `resolveLegGame` query and the settlement watcher's grading window.
   *
   * NULL when the parser couldn't infer a day-of-week and the user
   * hasn't supplied one yet — verify card surfaces a prompt so it can
   * be filled in retroactively.
   */
  gameDate: string | null;

  /**
   * Game tipoff/first-pitch time in 24h format ("18:00", "20:40") as
   * displayed on the slip in the user's device timezone. Combined with
   * `gameDate` and the device TZ at parse time to derive
   * `gameStartsAt`. Stored separately so the verify card can show the
   * user what they originally saw on the slip even if `gameStartsAt`
   * later gets corrected from public.games.
   *
   * NULL when not extractable; user can fill in via the verify card.
   */
  gameStartTime: string | null;

  /**
   * ISO UTC timestamp of when the game starts. Derived from
   * (gameDate + gameStartTime + device TZ) at save time, then
   * cross-validated against public.games.starts_at when the game is
   * resolved. Authoritative for the watcher's grading window — replaces
   * `placed_at` as the dateHint when set, eliminating the futures-bet
   * failure mode of the placed_at-anchored ±36h window.
   *
   * Watcher behavior keyed on this:
   *   - NULL → fall back to placed_at + asymmetric window (legacy bets).
   *   - Set, in the future → skip with `skipped_game_not_final` cheaply
   *     (no ESPN call until the game has actually been played).
   *   - Set, in the past → tight ±12h window around this for gamelog
   *     entry matching.
   */
  gameStartsAt: string | null;

  /**
   * How `gameId` was resolved. Surfaces in the verify card so the user
   * knows whether we matched their game cleanly or just made a best
   * guess by closest-time within the same date.
   *
   *   - 'exact-time'   — slip-time is within ~30 min of games.starts_at
   *   - 'closest-time' — same teams + same date matched, but time
   *                      delta was larger (likely TZ slop or rounding)
   *   - 'manual'       — user picked the game directly via verify card
   *   - null           — gameId is null (no match found, or query not
   *                      run yet)
   */
  gameMatchSource: 'exact-time' | 'closest-time' | 'manual' | null;
};

/**
 * Frozen audit record written by the settlement watcher when it grades
 * a leg. Used by the reconciliation cron (re-check stat corrections in
 * the last ~30 minutes) and by the user-facing dispute flow (Phase G).
 *
 * Why we store this verbatim instead of recomputing: ESPN issues stat
 * corrections after the fact; we want the user to be able to see
 * "we graded this as Lost based on Brunson's 14 pts at 2026-05-04T22:14:11Z"
 * even if the box score later updates.
 */
export type LegGradingSnapshot = {
  /** When the settlement watcher made this grading decision. */
  gradedAt: string;
  /** Source of truth for the actual stat value at grading time. */
  source: 'espn-gamelog' | 'espn-boxscore' | 'manual-override' | 'screenshot-trusted';
  /** The numeric value used to grade (matches DfsBetLeg.actualValue). */
  actualValue: number | null;
  /** Date string from the gamelog entry that matched, when relevant. */
  gameLogEntryDate: string | null;
};

/**
 * Payout split (Underdog only - PrizePicks always has bonus = 0).
 * Computed once we know the actual payout. See bet-service.computeBoostSplit.
 */
export type DfsPayoutSplit = {
  total: number;
  withdrawable: number;
  bonus: number;
};

/**
 * Input shape for createDfsBet. The caller provides the multiplier as
 * shown on the slip (post-boost); the service computes potential_payout
 * = stake × multiplier × any further multipliers. profit_boost_pct is
 * captured separately so the payout split can be computed at settlement.
 */
export type CreateDfsBetInput = {
  userId: string;
  app: DfsApp;
  playType: DfsPlayType;
  /** Total multiplier as displayed on the slip (post-boost). */
  multiplier: number;
  /** Standard pre-boost multiplier from the app reference table. NULL if unknown. */
  baseMultiplier?: number | null;
  profitBoostPct?: number | null; // 0.25 for +25%
  stakeAmount: number;
  legs: DfsBetLeg[];
  visibility?: 'private' | 'friends' | 'public';
  /** Source = 'screenshot' for vision-pipeline imports, 'manual' for typed entry. */
  source: 'screenshot' | 'manual';
  /** Storage path of the uploaded slip image when source='screenshot'. */
  parsedImageHash?: string | null;
  placedAt?: string;
  /** Optional reviewed initial settlement, mainly for final-state screenshots. */
  initialStatus?: DfsInitialBetStatus;
  initialSettledAt?: string | null;
  initialActualPayout?: number | null;
  settlementSource?: DfsSettlementSource | null;
};

/**
 * Reference table entry: standard payout multipliers per (app, play_type, pick_count, hits).
 * For Power/Standard plays, only the "all hit" entry is meaningful.
 * For Flex plays, every (pick_count, hits) row matters for grading.
 *
 * Lives in `src/features/bets/dfs-payouts.ts`.
 */
export type DfsPayoutTableEntry = {
  app: DfsApp;
  playType: DfsPlayType;
  pickCount: number;
  hits: number; // legs that hit (excluding DNPs which demote the play)
  multiplier: number;
};

/**
 * Result of running the vision pipeline on a screenshot. Always returns a
 * partial - fields we couldn't parse are left null/empty so the
 * confirmation screen can prompt the user to fill them in.
 */
export type DfsParseResult = {
  app: DfsApp;
  playType: DfsPlayType | null;
  multiplier: number | null;
  /** Pre-game / in-game screenshots may not show stake on Underdog. */
  stakeAmount: number | null;
  /** Implied potential payout from the slip header ("$X to pay $Y"). */
  potentialPayout: number | null;
  profitBoostPct: number | null;
  legs: DfsBetLeg[];
  /** 'pre' | 'live' | 'final' aggregated across legs (worst-case wins). */
  slipState: 'pre' | 'live' | 'final';
  /** 'pending' | 'won' | 'lost' - read from header badge when settled. */
  inferredStatus: 'pending' | 'won' | 'lost';
  /** Confidence indicator surfaced on the confirmation screen. */
  parseConfidence: 'full' | 'partial';
  /** Raw OCR text blocks for debugging. Stripped before persisting. */
  rawText: string[];
  /** Server/provider telemetry attached to model-assisted parses. */
  parseMeta?: BetslipParseMeta;
};
