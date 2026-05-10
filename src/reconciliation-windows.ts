/**
 * Per-league stat-correction windows for the reconciliation cron
 * (Phase G.write).
 *
 * A bet's `settled_at` is older than its league's window → the cron
 * leaves it alone. Bets in leagues without an entry are silently never
 * reconciled (locked in design — better than guessing a window).
 *
 * Numbers reflect ESPN's empirical correction-publishing windows:
 *   NBA / WNBA → most stat reviews land within 2h of game-final
 *   NFL        → 24h (NFL stat corrections are slow; routinely
 *                 amended a day later)
 *   MLB        → 6h (mid-tier; box-score scoring reviews)
 *
 * NHL is intentionally absent — until we run the numbers on its actual
 * correction window, "silently never reconcile" beats guessing 6h and
 * either spamming notifications (too short) or missing flips (too long).
 *
 * Soccer is moot: extractStatForProp returns null for soccer leagues
 * today, so even if the filter let MLS bets through, there'd be no
 * actual stat to compare against.
 */

export const RECONCILIATION_WINDOW_MS: Readonly<Record<string, number>> = {
  NBA: 2 * 60 * 60 * 1000,
  WNBA: 2 * 60 * 60 * 1000,
  NFL: 24 * 60 * 60 * 1000,
  MLB: 6 * 60 * 60 * 1000,
};

/** Leagues whose bets are eligible for the reconciliation cron, in array form. */
export const SUPPORTED_RECONCILIATION_LEAGUES: readonly string[] = Object.keys(
  RECONCILIATION_WINDOW_MS,
);

/**
 * Largest window across all supported leagues. The watcher uses this as
 * the SQL upper-bound on `settled_at` (single round-trip), then filters
 * per-league in memory using `isWithinReconciliationWindow`.
 */
export const MAX_RECONCILIATION_WINDOW_MS: number = Math.max(
  ...Object.values(RECONCILIATION_WINDOW_MS),
);

/**
 * Returns true when a bet's `settledAt` is within its league's window
 * relative to `now`. Returns false for unsupported leagues (so callers
 * don't have to gate). `now` is injectable for tests.
 *
 * Bets settled in the future (negative elapsed) are treated as in-window
 * — defensive against minor clock skew between the DB and the runtime.
 */
export function isWithinReconciliationWindow(
  league: string | null | undefined,
  settledAt: string | Date | null | undefined,
  now: Date | number = Date.now(),
): boolean {
  if (!league) return false;
  const window = RECONCILIATION_WINDOW_MS[league.toUpperCase()];
  if (window == null) return false;
  if (!settledAt) return false;
  const settledMs =
    settledAt instanceof Date ? settledAt.getTime() : new Date(settledAt).getTime();
  if (!Number.isFinite(settledMs)) return false;
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const elapsedMs = nowMs - settledMs;
  if (elapsedMs < 0) return true;
  return elapsedMs <= window;
}
