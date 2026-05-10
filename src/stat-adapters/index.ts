/**
 * DFS stat-adapter registry.
 *
 * `getStatAdapter(league)` returns the per-prop adapter table for the
 * league family. `extractStatForProp` is the thin dispatcher used by
 * the grader: normalize the raw propType string, look up the league's
 * adapter table, run it against the gamelog entry, return the numeric
 * value or null.
 *
 * Phase B coverage:
 *   - Basketball (NBA / WNBA / NCAAM) → all 11 basketball props
 *   - NFL → 13 props across passing/rushing/receiving categories
 *   - MLB → +2 props (Walks, Stolen Bases) on top of the existing
 *     adapter logic in dfs-grading-pure.ts (Hits, HR, RBI, K, ER, IP)
 *
 * Mirror: supabase/functions/_shared/dfs-stat-adapters/. Keep
 * functionally identical.
 */
import type { DfsPropTypeKey } from '../prop-normalizer';
import { asDfsPropTypeKey } from '../prop-normalizer';
import type { PlayerGameLogEntryShape } from '../grading';
import type { DfsApp } from '../types';
import { BASKETBALL_ADAPTERS } from './basketball';
import { NFL_ADAPTERS } from './nfl';
import { MLB_ADAPTERS } from './mlb';
import { NHL_ADAPTERS } from './nhl';

/**
 * Phase B.5 widened the adapter shape to receive the slip's source app.
 * Almost every adapter ignores `app`; the MLB Hitter FS / Fantasy Score
 * adapter is the only consumer today (per-book formula divergence). One
 * uniform signature beats two-shape dispatch + adapter-type routing.
 */
export type StatAdapter = (entry: PlayerGameLogEntryShape, app: DfsApp) => number | null;
export type AdapterTable = Partial<Record<DfsPropTypeKey, StatAdapter>>;

const BASKETBALL_LEAGUES = new Set(['NBA', 'WNBA', 'NCAAM', 'NCAAW']);

export function getStatAdapter(league: string): AdapterTable | null {
  if (BASKETBALL_LEAGUES.has(league)) return BASKETBALL_ADAPTERS;
  if (league === 'NFL') return NFL_ADAPTERS;
  if (league === 'MLB') return MLB_ADAPTERS;
  if (league === 'NHL') return NHL_ADAPTERS;
  return null;
}

/**
 * Resolve a numeric stat for a leg's prop type. Two-step:
 *   1. Normalize the propType to a canonical DfsPropTypeKey.
 *   2. Dispatch to the league's adapter table.
 *
 * Returns null when the prop isn't in our enum, the league has no
 * adapter table, or the adapter can't extract the value (e.g. NFL
 * categories absent on entry, MLB Hitter FS gated off, etc.).
 */
export function extractStatForPropViaRegistry(
  propType: string,
  league: string,
  entry: PlayerGameLogEntryShape,
  app: DfsApp,
): number | null {
  const key = asDfsPropTypeKey(propType);
  if (!key) return null;
  const table = getStatAdapter(league);
  if (!table) return null;
  const adapter = table[key];
  return adapter ? adapter(entry, app) : null;
}
