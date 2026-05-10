/**
 * Pure helpers for the bet-dfs-live-watcher (Phase D).
 *
 *   - shouldWriteLiveActual — diff + null-protection predicate. Live
 *     actuals must monotonically advance from null → number, never
 *     regress to null on a transient ESPN miss.
 *   - buildLiveSnapshot — construct a LegLiveSnapshot for a leg whose
 *     actualValue just advanced. Caller decides when to invoke (gated
 *     by shouldWriteLiveActual).
 *
 * The box-score → gamelog shape conversion lives in
 * supabase/functions/_shared/box-score-to-gamelog-adapter.ts (Deno
 * helper) — a shared piece between the live watcher and any future
 * client preview. This module keeps only the watcher-specific
 * predicate / snapshot construction.
 *
 * Mirror: supabase/functions/_shared/dfs-live-helpers.ts. Keep
 * functionally identical.
 */
import type { LegLiveSnapshot } from './types';

/**
 * Decide whether to write a new actual value onto a leg.
 *
 *   - null extracted → never write (transient ESPN miss / partial response;
 *     writing null over a real value would clobber good data).
 *   - extracted equals current → skip the write entirely (no MVCC churn,
 *     no liveSnapshot.lastLiveStatAt drift).
 *   - extracted is a finite number that differs from current → write.
 *
 * Caller treats `false` as a no-op for that leg.
 */
export function shouldWriteLiveActual(
  extractedValue: number | null,
  currentActualValue: number | null,
): boolean {
  if (extractedValue === null) return false;
  if (!Number.isFinite(extractedValue)) return false;
  return extractedValue !== currentActualValue;
}

/**
 * Build a fresh live snapshot for a leg whose actualValue just advanced.
 * Pure — caller decides when to invoke (gated by shouldWriteLiveActual).
 */
export function buildLiveSnapshot(
  actualValue: number,
  nowIso: string,
  source: LegLiveSnapshot['source'] = 'espn-summary',
): LegLiveSnapshot {
  return { actualValue, lastLiveStatAt: nowIso, source };
}

/* ────────────────────────────────────────────────────────────────────
 * Phase F.live — push notification title builder
 * ────────────────────────────────────────────────────────────────── */

/**
 * Build the push title for a per-leg live alert. Format:
 *
 *   {emoji} {playerName} {actualValue} {propType} — {direction} {line} {verb}
 *
 * Examples:
 *   "⚡ Brunson 35 PTS — over 33.5 hit"      (won, over)
 *   "⚡ Brunson 14 PTS — under 33.5 hit"     (won, under)
 *   "💔 Brunson 14 PTS — over 33.5 missed"   (lost, over)
 *   "💔 Brunson 35 PTS — under 33.5 busted"  (lost, under)
 *
 * Same shape across all four outcomes so the user's mental model is
 * uniform: "{name} {actual} {prop} — {direction} {result}". The push
 * title is the user's only window into what happened until they open
 * the app, so we lead with the value (not just "leg hit") so the
 * outcome resolves in one read.
 */
export function buildLiveLegAlertTitle(opts: {
  playerName: string;
  propType: string;
  line: number;
  direction: 'over' | 'under';
  actualValue: number;
  status: 'won' | 'lost';
}): string {
  const emoji = opts.status === 'won' ? '⚡' : '💔';
  const verb =
    opts.status === 'won' ? 'hit' : opts.direction === 'over' ? 'missed' : 'busted';
  return `${emoji} ${opts.playerName} ${opts.actualValue} ${opts.propType} — ${opts.direction} ${opts.line} ${verb}`;
}
