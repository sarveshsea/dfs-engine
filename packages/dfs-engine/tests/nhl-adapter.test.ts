/**
 * Tests for NHL_ADAPTERS — previously had zero coverage. The audit
 * flagged this because Power Play Points has fallback logic that can
 * silently grade as 0 when fields are undefined.
 *
 * Coverage:
 *   - Every skater prop (Goals, Assists, Points, SOG, PPP, Hits, Blocked Shots, TOI).
 *   - Every goalie prop (Saves, Goals Against, Saves Percentage, TOI).
 *   - Position discriminator — skater props null on goalie entries and vice versa.
 *   - TOI parsing across mm:ss / plain / DNP / "-".
 *   - Power Play Points partial-null behavior (current semantics).
 *   - Points fallback: prefers e.assists (PTS), falls back to G+A.
 */
import { extractStatForPropViaRegistry } from '../src/stat-adapters';
import { NHL_ADAPTERS } from '../src/stat-adapters/nhl';
import type { PlayerGameLogEntryShape } from '../src/grading';

function skater(overrides: Partial<PlayerGameLogEntryShape> = {}): PlayerGameLogEntryShape {
  return {
    date: '2026-05-04',
    minutes: '18:23',
    points: '2', // G
    rebounds: '1', // A
    assists: '3', // PTS (G+A pre-computed by gamelog parser)
    steals: '6', // SOG
    blocks: '4', // BS (boxscore-derived only; gamelog leaves '-')
    turnovers: '3', // HT (boxscore-derived only)
    threeP: '1', // PPA
    fg: '1', // PPG
    nhlPosition: 'skater',
    ...overrides,
  };
}

function goalie(overrides: Partial<PlayerGameLogEntryShape> = {}): PlayerGameLogEntryShape {
  return {
    date: '2026-05-04',
    minutes: '60:00',
    points: '34', // SV
    rebounds: '2', // GA
    assists: '36', // SA
    steals: '.944', // SV%
    blocks: '-',
    turnovers: '-',
    threeP: '-',
    nhlPosition: 'goalie',
    ...overrides,
  };
}

describe('NHL skater adapters', () => {
  const e = skater();

  test.each([
    ['Goals', 2],
    ['Assists', 1],
    ['Points', 3], // direct from e.assists (PTS pre-computed)
    ['Shots on Goal', 6],
    ['Power Play Points', 2], // ppg=1 + ppa=1
    ['Hits', 3], // HT from e.turnovers
    ['Blocked Shots', 4], // BS from e.blocks
  ])('NHL skater %s → %s', (prop, expected) => {
    expect(extractStatForPropViaRegistry(prop, 'NHL', e, 'prizepicks')).toBe(expected);
  });

  test('Time On Ice parses mm:ss to fractional minutes', () => {
    expect(extractStatForPropViaRegistry('Time On Ice', 'NHL', e, 'prizepicks')).toBe(18.38);
    expect(
      extractStatForPropViaRegistry(
        'Time On Ice',
        'NHL',
        skater({ minutes: '20:00' }),
        'prizepicks',
      ),
    ).toBe(20);
    expect(
      extractStatForPropViaRegistry(
        'Time On Ice',
        'NHL',
        skater({ minutes: '0:30' }),
        'prizepicks',
      ),
    ).toBe(0.5);
  });

  test('Time On Ice returns null on DNP / "-" / malformed', () => {
    expect(
      extractStatForPropViaRegistry('Time On Ice', 'NHL', skater({ minutes: 'DNP' }), 'prizepicks'),
    ).toBeNull();
    expect(
      extractStatForPropViaRegistry('Time On Ice', 'NHL', skater({ minutes: '-' }), 'prizepicks'),
    ).toBeNull();
    expect(
      extractStatForPropViaRegistry(
        'Time On Ice',
        'NHL',
        skater({ minutes: '60:99' }),
        'prizepicks',
      ),
    ).toBeNull();
  });

  test('Points falls back to summing G+A when PTS field is missing', () => {
    // Simulates boxscore-derived entries that don't ship PTS pre-computed.
    const noPts = skater({ assists: '-' });
    expect(extractStatForPropViaRegistry('Points', 'NHL', noPts, 'prizepicks')).toBe(3);
  });

  test('Points returns null when both PTS and G+A are unavailable', () => {
    const empty = skater({ assists: '-', points: '-', rebounds: '-' });
    expect(extractStatForPropViaRegistry('Points', 'NHL', empty, 'prizepicks')).toBeNull();
  });
});

describe('NHL Power Play Points — null-safety contract', () => {
  test('both ppg and ppa null → null (avoids silent zero-grade)', () => {
    const noPP = skater({ fg: '-', threeP: '-' });
    expect(
      extractStatForPropViaRegistry('Power Play Points', 'NHL', noPP, 'prizepicks'),
    ).toBeNull();
  });

  test('only ppg present → ppg + 0', () => {
    const ppgOnly = skater({ fg: '2', threeP: '-' });
    expect(extractStatForPropViaRegistry('Power Play Points', 'NHL', ppgOnly, 'prizepicks')).toBe(
      2,
    );
  });

  test('only ppa present → 0 + ppa', () => {
    const ppaOnly = skater({ fg: '-', threeP: '3' });
    expect(extractStatForPropViaRegistry('Power Play Points', 'NHL', ppaOnly, 'prizepicks')).toBe(
      3,
    );
  });

  test('both present → sum', () => {
    const both = skater({ fg: '1', threeP: '2' });
    expect(extractStatForPropViaRegistry('Power Play Points', 'NHL', both, 'prizepicks')).toBe(3);
  });
});

describe('NHL goalie adapters', () => {
  const g = goalie();

  test.each([
    ['Saves', 34],
    ['Goals Against', 2],
    ['Saves Percentage', 0.944],
  ])('NHL goalie %s → %s', (prop, expected) => {
    expect(extractStatForPropViaRegistry(prop, 'NHL', g, 'prizepicks')).toBe(expected);
  });

  test('Time On Ice works for both positions', () => {
    expect(extractStatForPropViaRegistry('Time On Ice', 'NHL', g, 'prizepicks')).toBe(60);
  });
});

describe('NHL position discriminator', () => {
  test('skater props return null on goalie entries', () => {
    const g = goalie();
    expect(extractStatForPropViaRegistry('Goals', 'NHL', g, 'prizepicks')).toBeNull();
    expect(extractStatForPropViaRegistry('Assists', 'NHL', g, 'prizepicks')).toBeNull();
    expect(extractStatForPropViaRegistry('Shots on Goal', 'NHL', g, 'prizepicks')).toBeNull();
    expect(extractStatForPropViaRegistry('Power Play Points', 'NHL', g, 'prizepicks')).toBeNull();
    expect(extractStatForPropViaRegistry('Hits', 'NHL', g, 'prizepicks')).toBeNull();
    expect(extractStatForPropViaRegistry('Blocked Shots', 'NHL', g, 'prizepicks')).toBeNull();
  });

  test('goalie props return null on skater entries', () => {
    const s = skater();
    expect(extractStatForPropViaRegistry('Saves', 'NHL', s, 'prizepicks')).toBeNull();
    expect(extractStatForPropViaRegistry('Goals Against', 'NHL', s, 'prizepicks')).toBeNull();
    expect(extractStatForPropViaRegistry('Saves Percentage', 'NHL', s, 'prizepicks')).toBeNull();
  });
});

describe('NHL adapter coverage smoke test', () => {
  test('every adapter in NHL_ADAPTERS is callable without throwing', () => {
    const s = skater();
    const g = goalie();
    for (const key of Object.keys(NHL_ADAPTERS)) {
      const adapter = NHL_ADAPTERS[key as keyof typeof NHL_ADAPTERS]!;
      expect(() => adapter(s, 'prizepicks')).not.toThrow();
      expect(() => adapter(g, 'prizepicks')).not.toThrow();
    }
  });
});
