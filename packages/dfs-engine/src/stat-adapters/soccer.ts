/**
 * Soccer stat adapters (v1.0).
 *
 * Covers Premier League (EPL), MLS, La Liga, NWSL, UEFA Champions
 * League — every league that PrizePicks / Underdog list soccer props
 * for. League assignment lives in stat-adapters/index.ts as the auto-
 * registrations.
 *
 * Field mapping:
 *   - Goals          → entry.points
 *   - Assists        → entry.rebounds
 *   - Shots          → entry.soccer.shots
 *   - Shots on Target → entry.soccer.shotsOnTarget
 *   - Passes Completed → entry.soccer.passesCompleted
 *   - Tackles        → entry.soccer.tackles
 *   - Yellow Cards   → entry.soccer.yellowCards (binary 1/0; players
 *                       can't be issued multiple yellow cards in one
 *                       match without converting to a red — books grade
 *                       this at the 0.5 line)
 *   - Pass Accuracy  → entry.soccer.passAccuracy (parsed as decimal
 *                       or percent — both ".87" and "87" → 87 for the
 *                       0..100 line books use)
 *
 * Goals and Assists reuse the canonical flat slots (points, rebounds)
 * so the per-league dispatch keeps a uniform shape; basketball, NHL,
 * and soccer all extract Goals/Assists from the same slot positions.
 */
import type { DfsPropTypeKey } from '../prop-normalizer';
import type { StatAdapter } from './index';

function numOrNull(raw: string | undefined): number | null {
  if (!raw || raw === '-' || raw === '—') return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse pass-accuracy in either format the upstream might ship:
 *   "0.87"  → 87
 *   ".87"   → 87
 *   "87"    → 87
 *   "87.5"  → 87.5
 * Books always set the line on the 0..100 scale, so we normalize
 * decimal forms upward. Null on missing / unparseable.
 */
function parsePassAccuracy(raw: string | undefined): number | null {
  if (!raw || raw === '-' || raw === '—') return null;
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  // 0..1 decimal scale → percent.
  if (n >= 0 && n <= 1) return Math.round(n * 1000) / 10;
  return n;
}

export const SOCCER_ADAPTERS: Partial<Record<DfsPropTypeKey, StatAdapter>> = {
  Goals: (e) => numOrNull(e.points),
  Assists: (e) => numOrNull(e.rebounds),
  Shots: (e) => numOrNull(e.soccer?.shots),
  'Shots on Target': (e) => numOrNull(e.soccer?.shotsOnTarget),
  'Passes Completed': (e) => numOrNull(e.soccer?.passesCompleted),
  Tackles: (e) => numOrNull(e.soccer?.tackles),
  // Yellow Cards is binary on slips (0.5 line; one yellow = over).
  'Yellow Cards': (e) => {
    const v = numOrNull(e.soccer?.yellowCards);
    if (v == null) return null;
    return v >= 1 ? 1 : 0;
  },
  'Pass Accuracy': (e) => parsePassAccuracy(e.soccer?.passAccuracy),
};
