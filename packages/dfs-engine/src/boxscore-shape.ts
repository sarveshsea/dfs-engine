/**
 * Boxscore → PlayerGameLogEntryShape adapter.
 *
 * Some props are only available on the per-game boxscore endpoint, not
 * the season gamelog. NHL is the canonical example: Hits and Blocked
 * Shots ship on the boxscore but not the gamelog. This module converts
 * a boxscore player row into the same `PlayerGameLogEntryShape` the
 * stat adapters consume, so callers can mix sources without branching.
 *
 * NHL-only today. If MLB or NBA ever needs the same fallback path,
 * extend `boxScorePlayerToGameLogShape` to take a league and dispatch.
 *
 * The `BoxScorePlayer` / `BoxScoreTeam` shapes are inlined here so the
 * package stays standalone. They're intentionally tiny — `athleteId` +
 * `name` + a flat `stats: Record<string, string>` of ESPN's label-keyed
 * values. Adapt your own boxscore source to this shape upstream.
 */
import type { PlayerGameLogEntryShape } from './grading';

export interface BoxScorePlayer {
  /** ESPN athlete id, or '' when omitted by the source. */
  athleteId: string;
  name: string;
  /**
   * Raw label → value map (e.g. `{ PTS: '14', REB: '3', MIN: '11:23' }`).
   * Missing fields are absent (no null entries).
   */
  stats: Record<string, string>;
}

export interface BoxScoreTeam {
  /** ESPN team id, or '' when omitted by the source. */
  teamId: string;
  players: BoxScorePlayer[];
}

/**
 * Convert a single boxscore player's stats into the PlayerGameLogEntryShape
 * that adapters consume. NHL-only today.
 *
 * Discriminator: presence of `SV` or `SV%` in the stats map = goalie.
 * Skater blocks ship `G` / `A` / `S`; goalie blocks ship `SV` / `SV%` /
 * `GA`. The two label sets don't overlap on the load-bearing keys, so
 * detection is cheap and reliable.
 *
 * Field mapping mirrors the NHL gamelog parser branch — see
 * stat-adapters/nhl.ts for the full skater/goalie field-mapping
 * contract that adapters depend on.
 */
export function boxScorePlayerToGameLogShape(
  player: BoxScorePlayer,
  league: string,
  dateHint: string,
): PlayerGameLogEntryShape | null {
  if (league.toUpperCase() !== 'NHL') return null;
  const stats = player.stats;
  const isGoalie = stats['SV'] !== undefined || stats['SV%'] !== undefined;

  if (isGoalie) {
    return {
      date: dateHint,
      // Goalie remap (matches gamelog parser):
      //   points=SV, rebounds=GA, assists=SA, steals=SV%, minutes=TOI
      minutes: stats['TOI'] ?? '-',
      points: stats['SV'] ?? '-',
      rebounds: stats['GA'] ?? '-',
      assists: stats['SA'] ?? '-',
      steals: stats['SV%'] ?? '-',
      blocks: '-',
      turnovers: '-',
      threeP: '-',
      nhlPosition: 'goalie',
    };
  }

  // Skater. Boxscore labels include Hits (HT) and Blocked Shots (BS)
  // which are the gamelog-absent props this fallback is built for.
  // PTS isn't on the boxscore label set, so we leave entry.assists
  // empty — the Points adapter falls back to summing G+A
  // (entry.points + entry.rebounds) when entry.assists is null.
  // PPG / PPA aren't on boxscore either, so fg / threeP stay empty
  // — the Power Play Points adapter null-returns for boxscore-derived
  // entries (documented gap; gamelog handles PPP).
  return {
    date: dateHint,
    minutes: stats['TOI'] ?? '-',
    points: stats['G'] ?? '-',
    rebounds: stats['A'] ?? '-',
    assists: '-', // boxscore lacks PTS; Points adapter sums G+A
    steals: stats['S'] ?? '-',
    blocks: stats['BS'] ?? '-',
    turnovers: stats['HT'] ?? '-',
    threeP: '-',
    nhlPosition: 'skater',
  };
}

/**
 * Convenience: find a player in either team's roster by athleteId and
 * convert. Returns null if the player isn't in the boxscore (typical
 * if they were a healthy scratch — leg falls to manual settle).
 */
export function findAndConvertBoxScorePlayer(
  awayTeam: BoxScoreTeam,
  homeTeam: BoxScoreTeam,
  athleteId: string,
  league: string,
  dateHint: string,
): PlayerGameLogEntryShape | null {
  if (!athleteId) return null;
  const player =
    awayTeam.players.find((p) => p.athleteId === athleteId) ??
    homeTeam.players.find((p) => p.athleteId === athleteId);
  if (!player) return null;
  return boxScorePlayerToGameLogShape(player, league, dateHint);
}
