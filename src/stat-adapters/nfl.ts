/**
 * NFL stat adapters.
 *
 * NFL gamelogs span multiple stat categories per game — a QB's row
 * carries passing AND rushing columns, an RB's may carry rushing AND
 * receiving. The parser populates `entry.categories.{passing,rushing,
 * receiving}` keyed by ESPN's column labels (CMP / ATT / YDS / TD /
 * INT / CAR / REC / TGTS / etc.); adapters read from those keys
 * directly.
 *
 * Combo props ("Pass+Rush Yds", "Rush+Rec TDs") are intra-player —
 * always summed across categories on the same gamelog entry, never
 * across players.
 *
 * UNCOVERED PROPS — endpoint gap, not parser gap:
 *   Defensive props (tackles, sacks, defender INTs, def TDs) and
 *   special-teams props (FGs made, kick return yards) are NOT in
 *   ESPN's `/athletes/{id}/gamelog` response — verified empirically
 *   across multiple defenders (returns rushing/receiving/fumbles
 *   labels, all zeroed) and a kicker (returns the same default
 *   passing/rushing skeleton). The parser's `defensive` category
 *   slot is wired and ready, but the endpoint never populates it.
 *
 *   Unblocking these props requires extending the `/summary` box-score
 *   endpoint coverage (espn-boxscore-fetcher.ts) to NFL — a Phase B-
 *   sized refactor since NFL boxscores are also multi-category. Defer
 *   until a real defensive prop appears on a slip.
 */
import type { DfsPropTypeKey } from '../prop-normalizer';
import type { PlayerGameLogEntryShape } from '../grading';
import type { DfsApp } from '../types';

// Phase B.5 uniform shape — NFL adapters ignore `app`; books offer the
// same prop set with the same component definitions.
type StatAdapter = (entry: PlayerGameLogEntryShape, app: DfsApp) => number | null;

function numOrNull(raw: string | undefined): number | null {
  if (!raw || raw === '-' || raw === '—') return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function passing(entry: PlayerGameLogEntryShape, key: string): number | null {
  return numOrNull(entry.categories?.passing?.[key]);
}

function rushing(entry: PlayerGameLogEntryShape, key: string): number | null {
  return numOrNull(entry.categories?.rushing?.[key]);
}

function receiving(entry: PlayerGameLogEntryShape, key: string): number | null {
  return numOrNull(entry.categories?.receiving?.[key]);
}

/**
 * Sum across categories. For combos, a missing component is treated as
 * 0 (a player who didn't pass on a play still has 0 pass yards) — only
 * returns null when every category lookup is missing, which means the
 * categories object itself wasn't populated.
 */
function combo(parts: Array<number | null>): number | null {
  if (parts.every((p) => p == null)) return null;
  return parts.reduce<number>((sum, p) => sum + (p ?? 0), 0);
}

export const NFL_ADAPTERS: Partial<Record<DfsPropTypeKey, StatAdapter>> = {
  'Pass Yards': (e) => passing(e, 'YDS'),
  'Pass Completions': (e) => passing(e, 'CMP'),
  'Pass Attempts': (e) => passing(e, 'ATT'),
  'Pass TDs': (e) => passing(e, 'TD'),
  Interceptions: (e) => passing(e, 'INT'),
  'Rush Yards': (e) => rushing(e, 'YDS'),
  'Rush Attempts': (e) => rushing(e, 'CAR') ?? rushing(e, 'ATT'),
  'Rush TDs': (e) => rushing(e, 'TD'),
  Receptions: (e) => receiving(e, 'REC'),
  'Receiving Yards': (e) => receiving(e, 'YDS'),
  'Receiving TDs': (e) => receiving(e, 'TD'),
  'Pass+Rush Yds': (e) => combo([passing(e, 'YDS'), rushing(e, 'YDS')]),
  'Pass+Rush+Rec Yds': (e) => combo([passing(e, 'YDS'), rushing(e, 'YDS'), receiving(e, 'YDS')]),
  'Rush+Rec TDs': (e) => combo([rushing(e, 'TD'), receiving(e, 'TD')]),
  'Pass+Rush TDs': (e) => combo([passing(e, 'TD'), rushing(e, 'TD')]),
  'Pass+Rush+Rec TDs': (e) => combo([passing(e, 'TD'), rushing(e, 'TD'), receiving(e, 'TD')]),
};
