/**
 * Tests for boxScorePlayerToGameLogShape + findAndConvertBoxScorePlayer.
 *
 * Covers:
 *   - Skater vs goalie discrimination (SV / SV% presence)
 *   - The NHL-only league guard
 *   - Missing-stat fields default to '-' (not empty string, not undefined)
 *   - findAndConvertBoxScorePlayer's roster lookup across home + away
 */
import {
  boxScorePlayerToGameLogShape,
  findAndConvertBoxScorePlayer,
  type BoxScorePlayer,
  type BoxScoreTeam,
} from '../src/boxscore-shape';

const skater: BoxScorePlayer = {
  athleteId: '5678',
  name: 'McDavid',
  stats: { TOI: '21:14', G: '2', A: '1', S: '6', BS: '0', HT: '3' },
};

const goalie: BoxScorePlayer = {
  athleteId: '9999',
  name: 'Bobrovsky',
  stats: { TOI: '60:00', SV: '34', GA: '2', SA: '36', 'SV%': '.944' },
};

describe('boxScorePlayerToGameLogShape', () => {
  test('returns null for non-NHL leagues', () => {
    expect(boxScorePlayerToGameLogShape(skater, 'NBA', '2026-05-04')).toBeNull();
    expect(boxScorePlayerToGameLogShape(skater, 'NFL', '2026-05-04')).toBeNull();
    expect(boxScorePlayerToGameLogShape(skater, '', '2026-05-04')).toBeNull();
  });

  test('case-insensitive on league', () => {
    expect(boxScorePlayerToGameLogShape(skater, 'nhl', '2026-05-04')).not.toBeNull();
    expect(boxScorePlayerToGameLogShape(skater, 'Nhl', '2026-05-04')).not.toBeNull();
  });

  test('skater shape: HT→turnovers, BS→blocks, G→points, A→rebounds', () => {
    const shape = boxScorePlayerToGameLogShape(skater, 'NHL', '2026-05-04');
    expect(shape).toEqual({
      date: '2026-05-04',
      minutes: '21:14',
      points: '2',
      rebounds: '1',
      assists: '-',
      steals: '6',
      blocks: '0',
      turnovers: '3',
      threeP: '-',
      nhlPosition: 'skater',
    });
  });

  test('goalie discriminator: presence of SV', () => {
    const shape = boxScorePlayerToGameLogShape(goalie, 'NHL', '2026-05-04');
    expect(shape?.nhlPosition).toBe('goalie');
    expect(shape?.points).toBe('34'); // SV
    expect(shape?.rebounds).toBe('2'); // GA
    expect(shape?.steals).toBe('.944'); // SV%
  });

  test('goalie discriminator also fires when only SV% present', () => {
    const shape = boxScorePlayerToGameLogShape(
      { ...goalie, stats: { 'SV%': '.910', TOI: '60:00' } },
      'NHL',
      '2026-05-04',
    );
    expect(shape?.nhlPosition).toBe('goalie');
  });

  test('missing stats default to "-"', () => {
    const shape = boxScorePlayerToGameLogShape(
      { athleteId: 'x', name: 'Sparse', stats: {} },
      'NHL',
      '2026-05-04',
    );
    expect(shape).toEqual({
      date: '2026-05-04',
      minutes: '-',
      points: '-',
      rebounds: '-',
      assists: '-',
      steals: '-',
      blocks: '-',
      turnovers: '-',
      threeP: '-',
      nhlPosition: 'skater',
    });
  });
});

describe('findAndConvertBoxScorePlayer', () => {
  const away: BoxScoreTeam = { teamId: 'EDM', players: [skater] };
  const home: BoxScoreTeam = { teamId: 'FLA', players: [goalie] };

  test('finds player on the away roster', () => {
    const shape = findAndConvertBoxScorePlayer(away, home, '5678', 'NHL', '2026-05-04');
    expect(shape?.nhlPosition).toBe('skater');
    expect(shape?.points).toBe('2');
  });

  test('finds player on the home roster', () => {
    const shape = findAndConvertBoxScorePlayer(away, home, '9999', 'NHL', '2026-05-04');
    expect(shape?.nhlPosition).toBe('goalie');
  });

  test('returns null when athleteId is absent (scratched)', () => {
    expect(findAndConvertBoxScorePlayer(away, home, '0000', 'NHL', '2026-05-04')).toBeNull();
  });

  test('returns null when athleteId is empty string', () => {
    expect(findAndConvertBoxScorePlayer(away, home, '', 'NHL', '2026-05-04')).toBeNull();
  });
});
