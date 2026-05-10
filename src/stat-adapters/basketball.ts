/**
 * Basketball stat adapters — covers NBA, WNBA, and NCAAM, all of which
 * share ESPN's flat per-game gamelog shape (PTS / REB / AST / STL / BLK
 * / TO / 3PT as "made-attempts").
 *
 * Each adapter pulls the relevant numeric value from a single gamelog
 * entry. Returns null when the source field is missing or unparseable —
 * the caller (extractStatForProp) translates that into a "leg can't be
 * graded automatically" outcome.
 */
import type { DfsPropTypeKey } from '../prop-normalizer';
import type { PlayerGameLogEntryShape } from '../grading';
import type { DfsApp } from '../types';

// Phase B.5 widened the uniform adapter shape to (entry, app). Basketball
// adapters never branch on app; the parameter is accepted and ignored.
type StatAdapter = (entry: PlayerGameLogEntryShape, app: DfsApp) => number | null;

function numOrNull(raw: string | undefined): number | null {
  if (!raw || raw === '-' || raw === '—') return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function threesMade(entry: PlayerGameLogEntryShape): number | null {
  // ESPN basketball gamelogs return 3PT as "made-attempts" (e.g. "4-9").
  const parts = entry.threeP.split('-');
  if (parts.length !== 2) return null;
  return numOrNull(parts[0]);
}

function combo(entry: PlayerGameLogEntryShape, fields: Array<keyof PlayerGameLogEntryShape>): number | null {
  let total = 0;
  for (const f of fields) {
    const v = numOrNull(entry[f] as string | undefined);
    if (v == null) return null;
    total += v;
  }
  return total;
}

export const BASKETBALL_ADAPTERS: Partial<Record<DfsPropTypeKey, StatAdapter>> = {
  Points: (e) => numOrNull(e.points),
  Rebounds: (e) => numOrNull(e.rebounds),
  Assists: (e) => numOrNull(e.assists),
  Steals: (e) => numOrNull(e.steals),
  Blocks: (e) => numOrNull(e.blocks),
  Turnovers: (e) => numOrNull(e.turnovers),
  '3-Pointers Made': threesMade,
  'Pts+Rebs+Asts': (e) => combo(e, ['points', 'rebounds', 'assists']),
  'Pts+Rebs': (e) => combo(e, ['points', 'rebounds']),
  'Pts+Asts': (e) => combo(e, ['points', 'assists']),
  'Rebs+Asts': (e) => combo(e, ['rebounds', 'assists']),
};
