/**
 * Tests for the v0.3 prop additions (14 new canonical keys + aliases).
 *
 * Covers:
 *   - Basketball: Pts+Stls, Pts+Blks, Stls+Blks, Double-Double, Triple-Double
 *   - NFL: Longest Reception, Longest Rush, Longest Pass
 *   - MLB: Singles, Doubles, Triples, Runs, Pitching Outs
 *   - NHL: Plus/Minus
 *
 * Each prop is checked for: happy path, missing-data null, alias resolution,
 * and (for sport-gated props) cross-sport / cross-role isolation.
 */
import { asDfsPropTypeKey, extractStatForPropViaRegistry, normalizeDfsPropType } from '../src';
import type { PlayerGameLogEntryShape } from '../src';

function nbaEntry(overrides: Partial<PlayerGameLogEntryShape> = {}): PlayerGameLogEntryShape {
  return {
    date: '2026-04-30',
    minutes: '34',
    points: '31',
    rebounds: '11',
    assists: '6',
    steals: '2',
    blocks: '1',
    turnovers: '4',
    threeP: '5-11',
    ...overrides,
  };
}

function tripleDoubleEntry(): PlayerGameLogEntryShape {
  return nbaEntry({ points: '15', rebounds: '11', assists: '12' });
}

function nflWr(): PlayerGameLogEntryShape {
  return {
    date: '2026-09-14',
    minutes: '0',
    points: '0',
    rebounds: '0',
    assists: '0',
    steals: '0',
    blocks: '0',
    turnovers: '0',
    threeP: '-',
    categories: {
      receiving: { REC: '8', YDS: '142', TD: '1', LONG: '54', TGTS: '11' },
    },
  };
}

function nflRb(): PlayerGameLogEntryShape {
  return {
    date: '2026-09-14',
    minutes: '0',
    points: '0',
    rebounds: '0',
    assists: '0',
    steals: '0',
    blocks: '0',
    turnovers: '0',
    threeP: '-',
    categories: {
      rushing: { CAR: '22', YDS: '115', TD: '2', LONG: '38' },
      receiving: { REC: '4', YDS: '28', TD: '0', LONG: '12' },
    },
  };
}

function nflQb(): PlayerGameLogEntryShape {
  return {
    date: '2026-09-14',
    minutes: '0',
    points: '0',
    rebounds: '0',
    assists: '0',
    steals: '0',
    blocks: '0',
    turnovers: '0',
    threeP: '-',
    categories: {
      passing: { CMP: '22', ATT: '32', YDS: '275', TD: '3', INT: '1', LONG: '47' },
    },
  };
}

function mlbBatter(overrides: Partial<PlayerGameLogEntryShape> = {}): PlayerGameLogEntryShape {
  return {
    date: '2026-05-04',
    minutes: '4',
    points: '3', // H
    rebounds: '1', // HR
    assists: '2', // RBI
    steals: '1', // SB
    blocks: '1', // BB
    turnovers: '0',
    threeP: '-',
    mlbRole: 'batter',
    mlbExtras: {
      singles: '1',
      doubles: '1',
      triples: '0',
      runs: '2',
    },
    ...overrides,
  };
}

function mlbPitcher(overrides: Partial<PlayerGameLogEntryShape> = {}): PlayerGameLogEntryShape {
  return {
    date: '2026-05-04',
    minutes: '6.0',
    points: '8',
    rebounds: '6.1', // IP — 6 innings + 1 out = 19 outs
    assists: '2',
    steals: '3',
    blocks: '1',
    turnovers: '5',
    threeP: '1.10',
    mlbRole: 'pitcher',
    ...overrides,
  };
}

function nhlSkater(overrides: Partial<PlayerGameLogEntryShape> = {}): PlayerGameLogEntryShape {
  return {
    date: '2026-04-12',
    minutes: '21:14',
    points: '2',
    rebounds: '1',
    assists: '3',
    steals: '6',
    blocks: '0',
    turnovers: '3',
    threeP: '0',
    fg: '0',
    plusMinus: '2',
    nhlPosition: 'skater',
    ...overrides,
  };
}

describe('basketball v0.3 — defensive combos', () => {
  const e = nbaEntry();

  test.each([
    ['Pts+Stls', 33],
    ['Pts+Blks', 32],
    ['Stls+Blks', 3],
  ])('NBA %s → %s', (prop, expected) => {
    expect(extractStatForPropViaRegistry(prop, 'NBA', e, 'prizepicks')).toBe(expected);
  });

  test('alias: "Defensive Stats" → Stls+Blks', () => {
    expect(asDfsPropTypeKey('Defensive Stats')).toBe('Stls+Blks');
    expect(extractStatForPropViaRegistry('Defensive Stats', 'NBA', e, 'prizepicks')).toBe(3);
  });

  test('alias: token canonicalization for "Pts + Stl" / "PTS+BLK"', () => {
    expect(normalizeDfsPropType('Pts + Stl')).toBe('Pts+Stls');
    expect(normalizeDfsPropType('PTS+BLK')).toBe('Pts+Blks');
    expect(extractStatForPropViaRegistry('PTS+BLK', 'NBA', e, 'prizepicks')).toBe(32);
  });

  test('combo returns null when a component is missing', () => {
    const partial = nbaEntry({ steals: '-' });
    expect(extractStatForPropViaRegistry('Pts+Stls', 'NBA', partial, 'prizepicks')).toBeNull();
  });
});

describe('basketball v0.3 — Double-Double / Triple-Double', () => {
  test('PTS=31 REB=11 AST=6 STL=2 BLK=1 → Double-Double = 1', () => {
    const e = nbaEntry();
    expect(extractStatForPropViaRegistry('Double-Double', 'NBA', e, 'prizepicks')).toBe(1);
    expect(extractStatForPropViaRegistry('Triple-Double', 'NBA', e, 'prizepicks')).toBe(0);
  });

  test('PTS=15 REB=11 AST=12 → Triple-Double = 1', () => {
    expect(
      extractStatForPropViaRegistry('Triple-Double', 'NBA', tripleDoubleEntry(), 'prizepicks'),
    ).toBe(1);
    expect(
      extractStatForPropViaRegistry('Double-Double', 'NBA', tripleDoubleEntry(), 'prizepicks'),
    ).toBe(1);
  });

  test('only one stat in double figures → Double-Double = 0', () => {
    const e = nbaEntry({ points: '31', rebounds: '4', assists: '6', steals: '2', blocks: '1' });
    expect(extractStatForPropViaRegistry('Double-Double', 'NBA', e, 'prizepicks')).toBe(0);
  });

  test('quad-double counts as triple-double (>=3 categories)', () => {
    const e = nbaEntry({ points: '20', rebounds: '11', assists: '12', steals: '10', blocks: '2' });
    expect(extractStatForPropViaRegistry('Triple-Double', 'NBA', e, 'prizepicks')).toBe(1);
  });

  test('returns null when any category is unparseable', () => {
    const e = nbaEntry({ steals: '-' });
    expect(extractStatForPropViaRegistry('Double-Double', 'NBA', e, 'prizepicks')).toBeNull();
  });

  test('alias resolution', () => {
    expect(asDfsPropTypeKey('DD')).toBe('Double-Double');
    expect(asDfsPropTypeKey('double double')).toBe('Double-Double');
    expect(asDfsPropTypeKey('triple-double')).toBe('Triple-Double');
  });

  test('WNBA inherits the basketball table', () => {
    expect(extractStatForPropViaRegistry('Double-Double', 'WNBA', nbaEntry(), 'prizepicks')).toBe(
      1,
    );
  });
});

describe('NFL v0.3 — Longest Reception / Rush / Pass', () => {
  test('Longest Reception reads receiving.LONG', () => {
    expect(extractStatForPropViaRegistry('Longest Reception', 'NFL', nflWr(), 'prizepicks')).toBe(
      54,
    );
    expect(extractStatForPropViaRegistry('Longest Reception', 'NFL', nflRb(), 'prizepicks')).toBe(
      12,
    );
  });

  test('Longest Rush reads rushing.LONG', () => {
    expect(extractStatForPropViaRegistry('Longest Rush', 'NFL', nflRb(), 'prizepicks')).toBe(38);
  });

  test('Longest Pass reads passing.LONG', () => {
    expect(extractStatForPropViaRegistry('Longest Pass', 'NFL', nflQb(), 'prizepicks')).toBe(47);
  });

  test('null when the relevant category is missing', () => {
    expect(extractStatForPropViaRegistry('Longest Pass', 'NFL', nflWr(), 'prizepicks')).toBeNull();
    expect(extractStatForPropViaRegistry('Longest Rush', 'NFL', nflWr(), 'prizepicks')).toBeNull();
  });
});

describe('MLB v0.3 — batter peripherals', () => {
  test.each([
    ['Singles', 1],
    ['Doubles', 1],
    ['Triples', 0],
    ['Runs', 2],
  ])('MLB batter %s → %s', (prop, expected) => {
    expect(extractStatForPropViaRegistry(prop, 'MLB', mlbBatter(), 'prizepicks')).toBe(expected);
  });

  test('returns null when mlbExtras is absent', () => {
    const noExtras = mlbBatter({ mlbExtras: undefined });
    expect(extractStatForPropViaRegistry('Doubles', 'MLB', noExtras, 'prizepicks')).toBeNull();
  });

  test('returns null on pitcher entries (role discriminator)', () => {
    expect(extractStatForPropViaRegistry('Doubles', 'MLB', mlbPitcher(), 'prizepicks')).toBeNull();
    expect(extractStatForPropViaRegistry('Runs', 'MLB', mlbPitcher(), 'prizepicks')).toBeNull();
  });
});

describe('MLB v0.3 — Pitching Outs', () => {
  test('whole innings: 6.0 IP → 18 outs', () => {
    const p = mlbPitcher({ rebounds: '6.0' });
    expect(extractStatForPropViaRegistry('Pitching Outs', 'MLB', p, 'prizepicks')).toBe(18);
  });

  test('one out into the inning: 6.1 IP → 19 outs', () => {
    const p = mlbPitcher({ rebounds: '6.1' });
    expect(extractStatForPropViaRegistry('Pitching Outs', 'MLB', p, 'prizepicks')).toBe(19);
  });

  test('two outs into the inning: 6.2 IP → 20 outs', () => {
    const p = mlbPitcher({ rebounds: '6.2' });
    expect(extractStatForPropViaRegistry('Pitching Outs', 'MLB', p, 'prizepicks')).toBe(20);
  });

  test('returns null for malformed fractional IP (e.g. "6.5")', () => {
    const p = mlbPitcher({ rebounds: '6.5' });
    expect(extractStatForPropViaRegistry('Pitching Outs', 'MLB', p, 'prizepicks')).toBeNull();
  });

  test('returns null on batter entries (pitcher-only)', () => {
    expect(
      extractStatForPropViaRegistry('Pitching Outs', 'MLB', mlbBatter(), 'prizepicks'),
    ).toBeNull();
  });
});

describe('NHL v0.3 — Plus/Minus', () => {
  test('skater Plus/Minus reads entry.plusMinus', () => {
    expect(extractStatForPropViaRegistry('Plus/Minus', 'NHL', nhlSkater(), 'prizepicks')).toBe(2);
  });

  test('handles negative values', () => {
    expect(
      extractStatForPropViaRegistry(
        'Plus/Minus',
        'NHL',
        nhlSkater({ plusMinus: '-3' }),
        'prizepicks',
      ),
    ).toBe(-3);
  });

  test('null when plusMinus is missing or "-"', () => {
    expect(
      extractStatForPropViaRegistry(
        'Plus/Minus',
        'NHL',
        nhlSkater({ plusMinus: undefined }),
        'prizepicks',
      ),
    ).toBeNull();
    expect(
      extractStatForPropViaRegistry(
        'Plus/Minus',
        'NHL',
        nhlSkater({ plusMinus: '-' }),
        'prizepicks',
      ),
    ).toBeNull();
  });

  test('alias: "+/-" / "plus minus" → Plus/Minus', () => {
    expect(asDfsPropTypeKey('plus minus')).toBe('Plus/Minus');
    expect(asDfsPropTypeKey('Plus/Minus')).toBe('Plus/Minus');
  });
});
