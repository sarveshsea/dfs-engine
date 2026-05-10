/**
 * DFS payout reference tables (PrizePicks + Underdog).
 *
 * Used to:
 *   1. Demote a play when a leg goes DNP (6-pick → 5-pick) and recompute
 *      the bet multiplier without trusting only the original slip.
 *   2. Grade flex plays when the screenshot is read post-game and we
 *      need to verify the displayed multiplier matches the hit count.
 *   3. Estimate the pre-boost base multiplier when computing Underdog's
 *      withdrawable / bonus payout split.
 *
 * Caveats:
 *
 *   - These are STANDARD payouts (no Demon/Goblin modifiers, no profit
 *     boost, no state-specific overrides). When the slip's displayed
 *     multiplier diverges from our table, we treat the slip as truth and
 *     apply the table only as a ratio for demotion math:
 *
 *         new_multiplier ≈ current_multiplier × (table[demoted] / table[original])
 *
 *   - Tables current as of 2026-05. Apps adjust these periodically; if a
 *     user reports a recalc that looks wrong, the first thing to verify
 *     is whether the published payout schedule has changed.
 *
 *   - For PrizePicks Flex 5/6 = 1.75x in our last reference, but some
 *     promos show 2x. The displayed multiplier always wins; this table
 *     is only the demotion baseline.
 */
import type { DfsApp, DfsPlayType } from './types';

/**
 * Per-app payout schedule. Outer key: pick count. Inner key: hits.
 * For Power/Standard plays only the "all hit" entry exists; for Flex
 * plays every hit count from min to max appears.
 */
type PayoutSchedule = Record<number, Record<number, number>>;

const PRIZEPICKS_POWER: PayoutSchedule = {
  2: { 2: 3 },
  3: { 3: 5 },
  4: { 4: 10 },
  5: { 5: 20 },
  6: { 6: 37.5 },
};

const PRIZEPICKS_FLEX: PayoutSchedule = {
  3: { 3: 2.25, 2: 1.25 },
  4: { 4: 5, 3: 1.5 },
  5: { 5: 10, 4: 2, 3: 0.4 },
  6: { 6: 25, 5: 1.75, 4: 0.4 },
};

const UNDERDOG_STANDARD: PayoutSchedule = {
  2: { 2: 3 },
  3: { 3: 6 },
  4: { 4: 10 },
  5: { 5: 20 },
  6: { 6: 35 },
  7: { 7: 60 },
  8: { 8: 100 },
};

const UNDERDOG_FLEX: PayoutSchedule = {
  3: { 3: 2.25, 2: 1.25 },
  4: { 4: 6, 3: 1.5 },
  5: { 5: 10, 4: 2, 3: 0.4 },
  6: { 6: 25, 5: 2, 4: 0.4 },
  7: { 7: 50, 6: 5, 5: 1.5 },
  8: { 8: 80, 7: 10, 6: 2 },
};

function scheduleFor(app: DfsApp, playType: DfsPlayType): PayoutSchedule | null {
  if (app === 'prizepicks') {
    if (playType === 'power') return PRIZEPICKS_POWER;
    if (playType === 'flex') return PRIZEPICKS_FLEX;
    return null;
  }
  if (app === 'underdog') {
    if (playType === 'underdog_standard') return UNDERDOG_STANDARD;
    if (playType === 'underdog_flex') return UNDERDOG_FLEX;
    return null;
  }
  return null;
}

/**
 * Look up the standard multiplier for a (pickCount, hits) tuple. Returns
 * null when the app/play_type combo is unknown or the tuple isn't in the
 * schedule (e.g. asking for 1/6 on a flex play with 4-hit floor).
 */
export function lookupStandardMultiplier(opts: {
  app: DfsApp;
  playType: DfsPlayType;
  pickCount: number;
  hits: number;
}): number | null {
  const schedule = scheduleFor(opts.app, opts.playType);
  if (!schedule) return null;
  const row = schedule[opts.pickCount];
  if (!row) return null;
  const value = row[opts.hits];
  return typeof value === 'number' ? value : null;
}

/**
 * Recompute a bet's effective multiplier after one or more legs go DNP /
 * void. Demotion math:
 *
 *   1. Look up the standard multiplier at the *original* (pickCount,
 *      hits=pickCount) - i.e. the all-hit payout for the original tier.
 *   2. Look up the standard at the *surviving* (pickCount-dnpCount,
 *      survivingHits).
 *   3. Scale the slip's displayed multiplier by (surviving / original).
 *
 * The scaling preserves any Demon/Goblin or boost adjustment baked into
 * the displayed multiplier. When either lookup fails (unknown play type
 * or missing schedule entry), fall back to the original multiplier and
 * surface usedFallback=true so the caller can warn the user.
 *
 * Handles multi-DNP correctly: caller passes the *current* surviving
 * pick count and hits, not always pickCount-1.
 */
export function recalcMultiplierAfterDnp(opts: {
  app: DfsApp;
  playType: DfsPlayType;
  /** Pick count when the slip was originally placed. */
  originalPickCount: number;
  /** Pick count after removing all DNP legs. Must be ≥ 1 and ≤ originalPickCount. */
  survivingPickCount: number;
  /** Hits among the surviving (non-DNP) legs. */
  survivingHits: number;
  /** Multiplier as displayed on the original slip (post-boost, pre-DNP). */
  originalMultiplier: number;
}): { newMultiplier: number; usedFallback: boolean } {
  if (opts.survivingPickCount < 1 || opts.survivingPickCount > opts.originalPickCount) {
    return { newMultiplier: 0, usedFallback: true };
  }
  const original = lookupStandardMultiplier({
    app: opts.app,
    playType: opts.playType,
    pickCount: opts.originalPickCount,
    hits: opts.originalPickCount,
  });
  const surviving = lookupStandardMultiplier({
    app: opts.app,
    playType: opts.playType,
    pickCount: opts.survivingPickCount,
    hits: opts.survivingHits,
  });
  if (original == null || surviving == null || original <= 0) {
    return { newMultiplier: opts.originalMultiplier, usedFallback: true };
  }
  const ratio = surviving / original;
  const newMultiplier = Math.round(opts.originalMultiplier * ratio * 10000) / 10000;
  return { newMultiplier, usedFallback: false };
}

/**
 * Best-effort base (pre-boost) multiplier estimate. When a slip shows a
 * boosted multiplier that lifts the standard rate, this is what would
 * have applied without the boost. Used by computeBoostSplit on Underdog.
 */
export function lookupBaseMultiplier(opts: {
  app: DfsApp;
  playType: DfsPlayType;
  pickCount: number;
}): number | null {
  return lookupStandardMultiplier({ ...opts, hits: opts.pickCount });
}
