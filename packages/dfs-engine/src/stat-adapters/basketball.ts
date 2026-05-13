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
import type { StatAdapter } from './index';

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

function combo(
  entry: PlayerGameLogEntryShape,
  fields: Array<keyof PlayerGameLogEntryShape>,
): number | null {
  let total = 0;
  for (const f of fields) {
    const v = numOrNull(entry[f] as string | undefined);
    if (v == null) return null;
    total += v;
  }
  return total;
}

/**
 * Count the categories where the player hit double digits. Used by the
 * Double-Double / Triple-Double adapters. Returns null if any of the
 * five tracked stats is unparseable — partial data → manual settle.
 */
function doubleDigitCategories(entry: PlayerGameLogEntryShape): number | null {
  const stats = [
    numOrNull(entry.points),
    numOrNull(entry.rebounds),
    numOrNull(entry.assists),
    numOrNull(entry.steals),
    numOrNull(entry.blocks),
  ];
  if (stats.some((s) => s == null)) return null;
  return stats.filter((s) => (s as number) >= 10).length;
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
  // v0.3 defensive combos
  'Pts+Stls': (e) => combo(e, ['points', 'steals']),
  'Pts+Blks': (e) => combo(e, ['points', 'blocks']),
  'Stls+Blks': (e) => combo(e, ['steals', 'blocks']),
  // v0.3 double-double / triple-double — graded as 1 (achieved) / 0 (not).
  // Standard line is 0.5, so over=achievement, under=missed. Books treat
  // these as binary props; numeric output keeps the gradeLegFromActual
  // contract uniform (number vs line).
  'Double-Double': (e) => {
    const count = doubleDigitCategories(e);
    return count == null ? null : count >= 2 ? 1 : 0;
  },
  'Triple-Double': (e) => {
    const count = doubleDigitCategories(e);
    return count == null ? null : count >= 3 ? 1 : 0;
  },
};
