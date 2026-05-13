/**
 * Per-(league, prop) tests for the DFS stat-adapter registry.
 *
 * Phase B coverage:
 *   - Basketball: NBA / WNBA / NCAAM share one adapter table; tests
 *     drive every basketball prop key.
 *   - NFL: 13 props across passing / rushing / receiving categories,
 *     plus the two cross-category combos. Fixture data lives at
 *     tests/fixtures/dfs-gamelogs/nfl.json so adapter assertions read
 *     against realistic per-game stats.
 *   - MLB delta: Walks + Stolen Bases (Phase B additions). Pre-existing
 *     MLB props (Hits / HR / RBI / K / ER / IP) are exercised by the
 *     dfs-settlement.test.ts suite.
 *
 * The propType strings passed in are intentionally a mix of canonical
 * keys, known aliases, and OCR-style variants — the registry runs them
 * through normalizeDfsPropType, so each combo also exercises the
 * normalizer's coverage of that prop's alias map.
 */
import { normalizeDfsPropType, asDfsPropTypeKey } from '../src/prop-normalizer';
import { extractStatForPropViaRegistry, getStatAdapter } from '../src/stat-adapters';
import type { PlayerGameLogEntryShape } from '../src/grading';
import nflFixtures from './fixtures/nfl.json';

function nbaEntry(overrides: Partial<PlayerGameLogEntryShape> = {}): PlayerGameLogEntryShape {
  return {
    date: '2026-04-30',
    minutes: '34',
    points: '31',
    rebounds: '8',
    assists: '6',
    steals: '2',
    blocks: '1',
    turnovers: '4',
    threeP: '5-11',
    ...overrides,
  };
}

function mlbBatter(overrides: Partial<PlayerGameLogEntryShape> = {}): PlayerGameLogEntryShape {
  // Batter remap: points=H, rebounds=HR, assists=RBI, steals=SB, blocks=BB.
  // mlbRole='batter' is required — adapters return null without it so a
  // pitcher row never silently grades as a batter.
  return {
    date: '2026-05-04',
    minutes: '4',
    points: '2',
    rebounds: '1',
    assists: '3',
    steals: '2',
    blocks: '1',
    turnovers: '1',
    threeP: '-',
    mlbRole: 'batter',
    ...overrides,
  };
}

function mlbPitcher(overrides: Partial<PlayerGameLogEntryShape> = {}): PlayerGameLogEntryShape {
  // Pitcher remap: points=K, rebounds=IP, assists=ER, steals=BB(allowed),
  // blocks=HR(allowed), turnovers=H(allowed). Pitches Thrown lives at
  // mlbExtras.pitchesThrown (parsed from PC-ST). mlbRole='pitcher'
  // gates pitcher-only adapters.
  return {
    date: '2026-05-04',
    minutes: '6.0',
    points: '8',
    rebounds: '6.0',
    assists: '2',
    steals: '3',
    blocks: '1',
    turnovers: '5',
    threeP: '1.10',
    mlbRole: 'pitcher',
    ...overrides,
  };
}

function nflFixture(key: keyof typeof nflFixtures): PlayerGameLogEntryShape {
  const raw = nflFixtures[key] as unknown as PlayerGameLogEntryShape & {
    _player?: string;
    _comment?: string;
  };
  // Strip annotation fields when constructing the runtime shape.
  const {
    _player: _p,
    _comment: _c,
    ...rest
  } = raw as PlayerGameLogEntryShape & {
    _player?: string;
    _comment?: string;
  };
  return rest;
}

describe('basketball adapters', () => {
  const entry = nbaEntry();

  test.each([
    ['Points', 31],
    ['Rebounds', 8],
    ['Assists', 6],
    ['Steals', 2],
    ['Blocks', 1],
    ['Turnovers', 4],
    ['3-Pointers Made', 5],
    ['Pts+Rebs+Asts', 45],
    ['Pts+Rebs', 39],
    ['Pts+Asts', 37],
    ['Rebs+Asts', 14],
  ])('NBA %s → %s', (prop, expected) => {
    expect(extractStatForPropViaRegistry(prop, 'NBA', entry, 'prizepicks')).toBe(expected);
  });

  test('WNBA shares the basketball adapter table', () => {
    expect(extractStatForPropViaRegistry('Points', 'WNBA', entry, 'prizepicks')).toBe(31);
    expect(extractStatForPropViaRegistry('Rebs+Asts', 'WNBA', entry, 'prizepicks')).toBe(14);
  });

  test('NCAAM shares the basketball adapter table', () => {
    expect(extractStatForPropViaRegistry('3-Pointers Made', 'NCAAM', entry, 'prizepicks')).toBe(5);
  });

  test('NCAAW shares the basketball adapter table', () => {
    expect(extractStatForPropViaRegistry('Points', 'NCAAW', entry, 'prizepicks')).toBe(31);
    expect(extractStatForPropViaRegistry('Pts+Rebs+Asts', 'NCAAW', entry, 'prizepicks')).toBe(45);
  });

  test('alias resolution → 3-Pointers Made', () => {
    // Each alias normalizes to the same canonical key
    expect(extractStatForPropViaRegistry('3PT Made', 'NBA', entry, 'prizepicks')).toBe(5);
    expect(extractStatForPropViaRegistry('3PTM', 'NBA', entry, 'prizepicks')).toBe(5);
    expect(extractStatForPropViaRegistry('Threes', 'NBA', entry, 'prizepicks')).toBe(5);
  });

  test('combo prop returns null when a component is missing', () => {
    const partial = nbaEntry({ rebounds: '-' });
    expect(extractStatForPropViaRegistry('Pts+Rebs+Asts', 'NBA', partial, 'prizepicks')).toBeNull();
    expect(extractStatForPropViaRegistry('Pts+Rebs', 'NBA', partial, 'prizepicks')).toBeNull();
  });

  test('3-Pointers Made returns null on malformed threeP', () => {
    expect(
      extractStatForPropViaRegistry(
        '3-Pointers Made',
        'NBA',
        nbaEntry({ threeP: '-' }),
        'prizepicks',
      ),
    ).toBeNull();
  });
});

describe('NFL adapters — fixture-driven', () => {
  const qb = nflFixture('qb_pass_and_rush');
  const rb = nflFixture('rb_rush_and_rec');
  const wr = nflFixture('wr_receiving_first');
  const passOnlyQb = nflFixture('qb_no_rush');
  const noCategories = nflFixture('missing_categories');

  test('Pass Yards (QB)', () => {
    expect(extractStatForPropViaRegistry('Pass Yards', 'NFL', qb, 'prizepicks')).toBe(275);
    expect(extractStatForPropViaRegistry('Pass Yards', 'NFL', passOnlyQb, 'prizepicks')).toBe(380);
  });

  test('Pass Completions / Pass Attempts', () => {
    expect(extractStatForPropViaRegistry('Pass Completions', 'NFL', qb, 'prizepicks')).toBe(22);
    expect(extractStatForPropViaRegistry('Pass Attempts', 'NFL', qb, 'prizepicks')).toBe(32);
  });

  test('Pass TDs', () => {
    expect(extractStatForPropViaRegistry('Pass TDs', 'NFL', qb, 'prizepicks')).toBe(3);
    expect(extractStatForPropViaRegistry('Pass TDs', 'NFL', passOnlyQb, 'prizepicks')).toBe(4);
  });

  test('Interceptions (passing INT)', () => {
    expect(extractStatForPropViaRegistry('Interceptions', 'NFL', qb, 'prizepicks')).toBe(1);
    expect(extractStatForPropViaRegistry('Interceptions', 'NFL', passOnlyQb, 'prizepicks')).toBe(0);
  });

  test('Rush Yards / Rush Attempts / Rush TDs', () => {
    expect(extractStatForPropViaRegistry('Rush Yards', 'NFL', qb, 'prizepicks')).toBe(38);
    expect(extractStatForPropViaRegistry('Rush Yards', 'NFL', rb, 'prizepicks')).toBe(115);
    expect(extractStatForPropViaRegistry('Rush Attempts', 'NFL', qb, 'prizepicks')).toBe(9);
    expect(extractStatForPropViaRegistry('Rush Attempts', 'NFL', rb, 'prizepicks')).toBe(22);
    expect(extractStatForPropViaRegistry('Rush TDs', 'NFL', qb, 'prizepicks')).toBe(1);
    expect(extractStatForPropViaRegistry('Rush TDs', 'NFL', rb, 'prizepicks')).toBe(2);
  });

  test('Receptions / Receiving Yards / Receiving TDs', () => {
    expect(extractStatForPropViaRegistry('Receptions', 'NFL', wr, 'prizepicks')).toBe(8);
    expect(extractStatForPropViaRegistry('Receiving Yards', 'NFL', wr, 'prizepicks')).toBe(142);
    expect(extractStatForPropViaRegistry('Receiving TDs', 'NFL', wr, 'prizepicks')).toBe(1);
    // RB also has receiving stats
    expect(extractStatForPropViaRegistry('Receptions', 'NFL', rb, 'prizepicks')).toBe(4);
    expect(extractStatForPropViaRegistry('Receiving Yards', 'NFL', rb, 'prizepicks')).toBe(28);
    expect(extractStatForPropViaRegistry('Receiving TDs', 'NFL', rb, 'prizepicks')).toBe(0);
  });

  test('Pass+Rush Yds combo', () => {
    expect(extractStatForPropViaRegistry('Pass+Rush Yds', 'NFL', qb, 'prizepicks')).toBe(275 + 38);
    // QB without rushing — pass yards alone; missing rushing component
    // contributes 0 (intra-player combo, didn't rush at all).
    expect(extractStatForPropViaRegistry('Pass+Rush Yds', 'NFL', passOnlyQb, 'prizepicks')).toBe(
      380,
    );
  });

  test('Rush+Rec TDs combo', () => {
    expect(extractStatForPropViaRegistry('Rush+Rec TDs', 'NFL', qb, 'prizepicks')).toBe(1);
    expect(extractStatForPropViaRegistry('Rush+Rec TDs', 'NFL', rb, 'prizepicks')).toBe(2);
    expect(extractStatForPropViaRegistry('Rush+Rec TDs', 'NFL', wr, 'prizepicks')).toBe(1);
  });

  test('Pass+Rush+Rec Yds combo (3-way) — sums every present yardage category', () => {
    // Hurts: 275 pass + 38 rush + 0 rec (no rec category) = 313
    expect(extractStatForPropViaRegistry('Pass+Rush+Rec Yds', 'NFL', qb, 'prizepicks')).toBe(
      275 + 38,
    );
    // Barkley: 0 pass (no pass category) + 115 rush + 28 rec = 143
    expect(extractStatForPropViaRegistry('Pass+Rush+Rec Yds', 'NFL', rb, 'prizepicks')).toBe(
      115 + 28,
    );
    // Jefferson: 0 pass + 0 rush (no rushing category) + 142 rec = 142
    expect(extractStatForPropViaRegistry('Pass+Rush+Rec Yds', 'NFL', wr, 'prizepicks')).toBe(142);
    // Mahomes (pass-only): 380 + 0 + 0
    expect(
      extractStatForPropViaRegistry('Pass+Rush+Rec Yds', 'NFL', passOnlyQb, 'prizepicks'),
    ).toBe(380);
  });

  test('Pass+Rush TDs combo — scrambling QB sums pass + rush', () => {
    // Hurts: 3 pass TD + 1 rush TD = 4
    expect(extractStatForPropViaRegistry('Pass+Rush TDs', 'NFL', qb, 'prizepicks')).toBe(4);
    // Mahomes: 4 pass TD + 0 rush TD = 4
    expect(extractStatForPropViaRegistry('Pass+Rush TDs', 'NFL', passOnlyQb, 'prizepicks')).toBe(4);
    // RB without passing — 0 + 2 = 2
    expect(extractStatForPropViaRegistry('Pass+Rush TDs', 'NFL', rb, 'prizepicks')).toBe(2);
  });

  test('Pass+Rush+Rec TDs combo (3-way) — covers QB rushing/receiving outliers', () => {
    // Hurts: 3 pass + 1 rush + 0 rec = 4
    expect(extractStatForPropViaRegistry('Pass+Rush+Rec TDs', 'NFL', qb, 'prizepicks')).toBe(4);
    // Barkley: 0 + 2 + 0 = 2
    expect(extractStatForPropViaRegistry('Pass+Rush+Rec TDs', 'NFL', rb, 'prizepicks')).toBe(2);
    // Jefferson: 0 + 0 + 1 = 1
    expect(extractStatForPropViaRegistry('Pass+Rush+Rec TDs', 'NFL', wr, 'prizepicks')).toBe(1);
    // Mahomes pass-only: 4 + 0 + 0 = 4
    expect(
      extractStatForPropViaRegistry('Pass+Rush+Rec TDs', 'NFL', passOnlyQb, 'prizepicks'),
    ).toBe(4);
  });

  test('returns null when categories are absent', () => {
    expect(
      extractStatForPropViaRegistry('Pass Yards', 'NFL', noCategories, 'prizepicks'),
    ).toBeNull();
    expect(
      extractStatForPropViaRegistry('Receptions', 'NFL', noCategories, 'prizepicks'),
    ).toBeNull();
    expect(
      extractStatForPropViaRegistry('Pass+Rush Yds', 'NFL', noCategories, 'prizepicks'),
    ).toBeNull();
    expect(
      extractStatForPropViaRegistry('Pass+Rush+Rec Yds', 'NFL', noCategories, 'prizepicks'),
    ).toBeNull();
    expect(
      extractStatForPropViaRegistry('Pass+Rush TDs', 'NFL', noCategories, 'prizepicks'),
    ).toBeNull();
    expect(
      extractStatForPropViaRegistry('Pass+Rush+Rec TDs', 'NFL', noCategories, 'prizepicks'),
    ).toBeNull();
  });

  test('unknown NFL propType (no alias map) → null via registry', () => {
    // Verbatim "Rec Yards" from a slip stays unrecognised — Phase B
    // ships canonical-only for NFL. Adapter returns null and the leg
    // falls back to manual settlement.
    expect(asDfsPropTypeKey('Rec Yards')).toBeNull();
    expect(extractStatForPropViaRegistry('Rec Yards', 'NFL', qb, 'prizepicks')).toBeNull();
  });
});

describe('MLB batter adapters (role-discriminated)', () => {
  test('Hits / Home Runs / RBI / Walks / Stolen Bases read batter remap', () => {
    const batter = mlbBatter({
      points: '3', // H
      rebounds: '2', // HR
      assists: '5', // RBI
      steals: '1', // SB
      blocks: '2', // BB
    });
    expect(extractStatForPropViaRegistry('Hits', 'MLB', batter, 'prizepicks')).toBe(3);
    expect(extractStatForPropViaRegistry('Home Runs', 'MLB', batter, 'prizepicks')).toBe(2);
    expect(extractStatForPropViaRegistry('RBI', 'MLB', batter, 'prizepicks')).toBe(5);
    expect(extractStatForPropViaRegistry('Walks', 'MLB', batter, 'prizepicks')).toBe(2);
    expect(extractStatForPropViaRegistry('Stolen Bases', 'MLB', batter, 'prizepicks')).toBe(1);
  });

  test('Total Bases = 1·1B + 2·2B + 3·3B + 4·HR', () => {
    // 2·1 + 1·2 + 1·3 + 3·4 = 2 + 2 + 3 + 12 = 19
    const batter = mlbBatter({
      rebounds: '3', // HR
      mlbExtras: { singles: '2', doubles: '1', triples: '1' },
    });
    expect(extractStatForPropViaRegistry('Total Bases', 'MLB', batter, 'prizepicks')).toBe(19);
  });

  test('Total Bases returns null when any component is missing', () => {
    // Missing singles
    const noSingles = mlbBatter({
      rebounds: '1',
      mlbExtras: { doubles: '1', triples: '0' },
    });
    expect(extractStatForPropViaRegistry('Total Bases', 'MLB', noSingles, 'prizepicks')).toBeNull();
    // Missing HR (entry.rebounds)
    const noHR = mlbBatter({
      rebounds: '-',
      mlbExtras: { singles: '2', doubles: '1', triples: '0' },
    });
    expect(extractStatForPropViaRegistry('Total Bases', 'MLB', noHR, 'prizepicks')).toBeNull();
    // Missing mlbExtras entirely
    const noExtras = mlbBatter({ rebounds: '1', mlbExtras: undefined });
    expect(extractStatForPropViaRegistry('Total Bases', 'MLB', noExtras, 'prizepicks')).toBeNull();
  });

  test('Hits+Runs+RBIs sums batter H + R + RBI', () => {
    const batter = mlbBatter({
      points: '2', // H
      assists: '3', // RBI
      mlbExtras: { runs: '1' },
    });
    // 2 + 1 + 3 = 6
    expect(extractStatForPropViaRegistry('Hits+Runs+RBIs', 'MLB', batter, 'prizepicks')).toBe(6);
  });

  test('Hits+Runs+RBIs returns null when runs is missing', () => {
    const batter = mlbBatter({ points: '2', assists: '3', mlbExtras: {} });
    expect(extractStatForPropViaRegistry('Hits+Runs+RBIs', 'MLB', batter, 'prizepicks')).toBeNull();
  });

  test('batter-only adapters return null on a pitcher row', () => {
    const pitcher = mlbPitcher({
      points: '8',
      rebounds: '6.0',
      assists: '2',
      blocks: '1',
      steals: '4',
    });
    expect(extractStatForPropViaRegistry('Hits', 'MLB', pitcher, 'prizepicks')).toBeNull();
    expect(extractStatForPropViaRegistry('Home Runs', 'MLB', pitcher, 'prizepicks')).toBeNull();
    expect(extractStatForPropViaRegistry('RBI', 'MLB', pitcher, 'prizepicks')).toBeNull();
    expect(extractStatForPropViaRegistry('Walks', 'MLB', pitcher, 'prizepicks')).toBeNull();
    expect(extractStatForPropViaRegistry('Stolen Bases', 'MLB', pitcher, 'prizepicks')).toBeNull();
    expect(extractStatForPropViaRegistry('Total Bases', 'MLB', pitcher, 'prizepicks')).toBeNull();
    expect(
      extractStatForPropViaRegistry('Hits+Runs+RBIs', 'MLB', pitcher, 'prizepicks'),
    ).toBeNull();
  });

  test('missing stats return null', () => {
    expect(
      extractStatForPropViaRegistry('Walks', 'MLB', mlbBatter({ blocks: '-' }), 'prizepicks'),
    ).toBeNull();
    expect(
      extractStatForPropViaRegistry(
        'Stolen Bases',
        'MLB',
        mlbBatter({ steals: '—' }),
        'prizepicks',
      ),
    ).toBeNull();
    expect(
      extractStatForPropViaRegistry('Hits', 'MLB', mlbBatter({ points: '-' }), 'prizepicks'),
    ).toBeNull();
  });
});

describe('MLB pitcher adapters (role-discriminated)', () => {
  test('Strikeouts / Earned Runs / Innings Pitched read pitcher remap', () => {
    const pitcher = mlbPitcher({
      points: '9', // SO/K
      assists: '2', // ER
      rebounds: '6.0', // IP
    });
    expect(extractStatForPropViaRegistry('Strikeouts', 'MLB', pitcher, 'prizepicks')).toBe(9);
    expect(extractStatForPropViaRegistry('Earned Runs', 'MLB', pitcher, 'prizepicks')).toBe(2);
    expect(extractStatForPropViaRegistry('Innings Pitched', 'MLB', pitcher, 'prizepicks')).toBe(6);
  });

  test('Walks Allowed reads pitcher remap (entry.steals = pitcher BB)', () => {
    const pitcher = mlbPitcher({ steals: '4' });
    expect(extractStatForPropViaRegistry('Walks Allowed', 'MLB', pitcher, 'prizepicks')).toBe(4);
  });

  test('Hits Allowed reads pitcher remap (entry.turnovers = pitcher H)', () => {
    const pitcher = mlbPitcher({ turnovers: '7' });
    expect(extractStatForPropViaRegistry('Hits Allowed', 'MLB', pitcher, 'prizepicks')).toBe(7);
  });

  test('Pitches Thrown reads mlbExtras.pitchesThrown (parsed from PC-ST LHS)', () => {
    const pitcher = mlbPitcher({ mlbExtras: { pitchesThrown: '95' } });
    expect(extractStatForPropViaRegistry('Pitches Thrown', 'MLB', pitcher, 'prizepicks')).toBe(95);
  });

  test('Pitches Thrown returns null when PC-ST was absent (mlbExtras empty)', () => {
    const pitcher = mlbPitcher({ mlbExtras: {} });
    expect(
      extractStatForPropViaRegistry('Pitches Thrown', 'MLB', pitcher, 'prizepicks'),
    ).toBeNull();
    const pitcherNoExtras = mlbPitcher({ mlbExtras: undefined });
    expect(
      extractStatForPropViaRegistry('Pitches Thrown', 'MLB', pitcherNoExtras, 'prizepicks'),
    ).toBeNull();
  });

  test('pitcher-only adapters return null on a batter row', () => {
    const batter = mlbBatter({
      points: '2',
      rebounds: '1',
      assists: '3',
      steals: '2',
      blocks: '1',
      turnovers: '1',
    });
    expect(extractStatForPropViaRegistry('Strikeouts', 'MLB', batter, 'prizepicks')).toBeNull();
    expect(extractStatForPropViaRegistry('Earned Runs', 'MLB', batter, 'prizepicks')).toBeNull();
    expect(
      extractStatForPropViaRegistry('Innings Pitched', 'MLB', batter, 'prizepicks'),
    ).toBeNull();
    expect(extractStatForPropViaRegistry('Walks Allowed', 'MLB', batter, 'prizepicks')).toBeNull();
    expect(extractStatForPropViaRegistry('Hits Allowed', 'MLB', batter, 'prizepicks')).toBeNull();
    expect(extractStatForPropViaRegistry('Pitches Thrown', 'MLB', batter, 'prizepicks')).toBeNull();
  });
});

describe('registry plumbing', () => {
  test('getStatAdapter returns a table for known leagues', () => {
    expect(getStatAdapter('NBA')).not.toBeNull();
    expect(getStatAdapter('WNBA')).not.toBeNull();
    expect(getStatAdapter('NCAAM')).not.toBeNull();
    expect(getStatAdapter('NCAAW')).not.toBeNull();
    expect(getStatAdapter('NFL')).not.toBeNull();
    expect(getStatAdapter('MLB')).not.toBeNull();
  });

  test('getStatAdapter returns null for unsupported leagues', () => {
    expect(getStatAdapter('SOCCER')).toBeNull();
    expect(getStatAdapter('UFC')).toBeNull();
  });

  test('normalizeDfsPropType resolves aliases case-insensitively', () => {
    expect(normalizeDfsPropType('points')).toBe('Points');
    expect(normalizeDfsPropType('  PTS  ')).toBe('Points');
    expect(normalizeDfsPropType('threes')).toBe('3-Pointers Made');
    expect(normalizeDfsPropType('Pts + Rebs + Asts')).toBe('Pts+Rebs+Asts');
    expect(normalizeDfsPropType('PASS YARDS')).toBe('Pass Yards');
  });

  test('normalizeDfsPropType preserves unknown verbatim', () => {
    // 'Rec Yards' has no NFL alias mapping — preserved verbatim.
    expect(normalizeDfsPropType('Rec Yards')).toBe('Rec Yards');
    expect(normalizeDfsPropType('Some Made-Up Prop')).toBe('Some Made-Up Prop');
  });

  test('normalizeDfsPropType handles slip combo variants via token canonicalization', () => {
    // Underdog OCR commonly emits "PTS+REB" — no spaces, abbreviated
    // singular tokens. Token-aware fallback canonicalizes to plural.
    expect(normalizeDfsPropType('PTS+REB')).toBe('Pts+Rebs');
    expect(normalizeDfsPropType('pts+reb')).toBe('Pts+Rebs');
    expect(normalizeDfsPropType('Pts + Reb')).toBe('Pts+Rebs');
    expect(normalizeDfsPropType('Points+Rebounds')).toBe('Pts+Rebs');
    expect(normalizeDfsPropType('PT+REB')).toBe('Pts+Rebs');

    expect(normalizeDfsPropType('PTS+AST')).toBe('Pts+Asts');
    expect(normalizeDfsPropType('REB+AST')).toBe('Rebs+Asts');
    expect(normalizeDfsPropType('PTS+REB+AST')).toBe('Pts+Rebs+Asts');
    expect(normalizeDfsPropType('Points+Rebounds+Assists')).toBe('Pts+Rebs+Asts');
  });

  test('asDfsPropTypeKey returns canonical key for slip combo variants', () => {
    expect(asDfsPropTypeKey('PTS+REB')).toBe('Pts+Rebs');
    expect(asDfsPropTypeKey('pts+ast')).toBe('Pts+Asts');
    expect(asDfsPropTypeKey('reb+ast')).toBe('Rebs+Asts');
    expect(asDfsPropTypeKey('pts+reb+ast')).toBe('Pts+Rebs+Asts');
  });

  test('normalizeDfsPropType resolves H.mlb-extras canonicals exactly', () => {
    // After Wave 4 H.mlb-extras these are canonical keys (not alias-driven).
    expect(normalizeDfsPropType('Hits')).toBe('Hits');
    expect(normalizeDfsPropType('Home Runs')).toBe('Home Runs');
    expect(normalizeDfsPropType('Total Bases')).toBe('Total Bases');
    expect(normalizeDfsPropType('Hits+Runs+RBIs')).toBe('Hits+Runs+RBIs');
    expect(normalizeDfsPropType('Walks Allowed')).toBe('Walks Allowed');
    expect(normalizeDfsPropType('Pitches Thrown')).toBe('Pitches Thrown');
  });
});

/* ────────────────────────────────────────────────────────────────────
 * Phase B.5 — MLB Hitter FS + Underdog Fantasy Score
 *
 * Per-book composite. Both keys exist in the canonical enum and route
 * to the same adapter; the adapter branches on `app` to apply the
 * right per-book formula.
 *
 *   PrizePicks Hitter FS = 3·1B + 5·2B + 8·3B + 10·HR + 2·R + 2·RBI
 *                          + 2·BB + 2·HBP + 5·SB
 *   Underdog Fantasy Score (hitters) = 1·1B + 2·2B + 3·3B + 4·HR
 *
 * Gated by HITTER_FS_AUTO_GRADE — the test suite flips this on per
 * test via process.env so the formula path runs. Without the flag the
 * adapter returns null (default-off in production).
 * ────────────────────────────────────────────────────────────────── */

/**
 * mlbExtras shape with HBP added. The canonical PlayerGameLogMlbExtras
 * intentionally omits `hbp` because ESPN doesn't surface it per-game;
 * the adapter reads via a relaxed cast. Tests inject hbp to verify the
 * full PrizePicks formula.
 */
type MlbExtrasWithHbp = NonNullable<PlayerGameLogEntryShape['mlbExtras']> & {
  hbp?: string;
};

function mlbBatterFull(
  opts: {
    flatOverrides?: Partial<PlayerGameLogEntryShape>;
    extrasOverrides?: Partial<MlbExtrasWithHbp>;
  } = {},
): PlayerGameLogEntryShape {
  // Canonical batter line: 5-for-4 (impossible AB but H matters) with
  // a double, a triple, a homer; 1 walk, 1 SB, 1 HBP, 2 R, 3 RBI.
  // singles = H − 2B − 3B − HR = 5 − 1 − 1 − 1 = 2.
  const baseExtras: MlbExtrasWithHbp = {
    singles: '2',
    doubles: '1',
    triples: '1',
    runs: '2',
    hbp: '1',
    ...opts.extrasOverrides,
  };
  return {
    date: '2026-05-04',
    minutes: '4', // AB for batters
    points: '5', // H
    rebounds: '1', // HR
    assists: '3', // RBI
    steals: '1', // SB
    blocks: '1', // BB
    turnovers: '0', // SO
    threeP: '-',
    mlbRole: 'batter',
    mlbExtras: baseExtras as PlayerGameLogEntryShape['mlbExtras'],
    ...opts.flatOverrides,
  };
}

describe('MLB Hitter FS / Fantasy Score (Phase B.5)', () => {
  // v0.2: the auto-grade gate moved from process.env to an explicit
  // adapter option. All tests below pass it as `FS_OPTS`. The "gate off"
  // tests omit it (or pass an empty bag).
  const FS_OPTS = { hitterFsAutoGrade: true } as const;

  describe('feature-flag gate', () => {
    test('returns null when opts is omitted entirely', () => {
      const e = mlbBatterFull();
      expect(extractStatForPropViaRegistry('Hitter FS', 'MLB', e, 'prizepicks')).toBeNull();
      expect(extractStatForPropViaRegistry('Fantasy Score', 'MLB', e, 'underdog')).toBeNull();
    });

    test('returns null when opts.hitterFsAutoGrade is false', () => {
      const e = mlbBatterFull();
      expect(
        extractStatForPropViaRegistry('Hitter FS', 'MLB', e, 'prizepicks', {
          hitterFsAutoGrade: false,
        }),
      ).toBeNull();
    });

    test('returns null when opts is an empty object', () => {
      const e = mlbBatterFull();
      expect(extractStatForPropViaRegistry('Hitter FS', 'MLB', e, 'prizepicks', {})).toBeNull();
    });
  });

  describe('PrizePicks formula', () => {
    test('full canonical line: 3·2 + 5·1 + 8·1 + 10·1 + 2·2 + 2·3 + 2·1 + 2·1 + 5·1 = 48', () => {
      const e = mlbBatterFull();
      // singles=2, doubles=1, triples=1, hr=1, runs=2, rbi=3, bb=1, hbp=1, sb=1
      // = 6 + 5 + 8 + 10 + 4 + 6 + 2 + 2 + 5 = 48
      expect(extractStatForPropViaRegistry('Hitter FS', 'MLB', e, 'prizepicks', FS_OPTS)).toBe(48);
    });

    test('zero across the line: 0 from every component', () => {
      const e = mlbBatterFull({
        flatOverrides: {
          points: '0',
          rebounds: '0',
          assists: '0',
          steals: '0',
          blocks: '0',
        },
        extrasOverrides: {
          singles: '0',
          doubles: '0',
          triples: '0',
          runs: '0',
          hbp: '0',
        },
      });
      expect(extractStatForPropViaRegistry('Hitter FS', 'MLB', e, 'prizepicks', FS_OPTS)).toBe(0);
    });

    test('a missing component → null (any null kills the composite)', () => {
      const e = mlbBatterFull({ extrasOverrides: { hbp: '-' } });
      expect(
        extractStatForPropViaRegistry('Hitter FS', 'MLB', e, 'prizepicks', FS_OPTS),
      ).toBeNull();
    });

    test('production behaviour: HBP-absent mlbExtras (canonical shape) → null until a feed adds HBP', () => {
      // The shape omits hbp by design; the formula reads it via cast.
      // When the upstream parser doesn't populate hbp, the adapter
      // returns null and the leg falls to manual-settle. Pin this
      // contract so a future feed swap can't silently start grading.
      const e = mlbBatterFull({ extrasOverrides: { hbp: undefined } });
      expect(
        extractStatForPropViaRegistry('Hitter FS', 'MLB', e, 'prizepicks', FS_OPTS),
      ).toBeNull();
    });

    test('each component contributes its weighted value (single-component perturbation)', () => {
      const baseline = mlbBatterFull();
      expect(
        extractStatForPropViaRegistry('Hitter FS', 'MLB', baseline, 'prizepicks', FS_OPTS),
      ).toBe(48);
      // +1 single → +3
      expect(
        extractStatForPropViaRegistry(
          'Hitter FS',
          'MLB',
          mlbBatterFull({ extrasOverrides: { singles: '3' } }),
          'prizepicks',
          FS_OPTS,
        ),
      ).toBe(48 + 3);
      // +1 double → +5
      expect(
        extractStatForPropViaRegistry(
          'Hitter FS',
          'MLB',
          mlbBatterFull({ extrasOverrides: { doubles: '2' } }),
          'prizepicks',
          FS_OPTS,
        ),
      ).toBe(48 + 5);
      // +1 HR → +10 (HR lives on the flat field via batter remap)
      expect(
        extractStatForPropViaRegistry(
          'Hitter FS',
          'MLB',
          mlbBatterFull({ flatOverrides: { rebounds: '2' } }),
          'prizepicks',
          FS_OPTS,
        ),
      ).toBe(48 + 10);
      // +1 SB → +5 (SB lives on the flat field via batter remap)
      expect(
        extractStatForPropViaRegistry(
          'Hitter FS',
          'MLB',
          mlbBatterFull({ flatOverrides: { steals: '2' } }),
          'prizepicks',
          FS_OPTS,
        ),
      ).toBe(48 + 5);
    });
  });

  describe('Underdog formula (Total Bases)', () => {
    test('1·1B + 2·2B + 3·3B + 4·HR — baseline batter scores 11', () => {
      const e = mlbBatterFull();
      // singles=2, doubles=1, triples=1, hr=1
      // = 2 + 2 + 3 + 4 = 11
      expect(extractStatForPropViaRegistry('Fantasy Score', 'MLB', e, 'underdog', FS_OPTS)).toBe(
        11,
      );
    });

    test('ignores walks / SB / HBP / R / RBI even when present', () => {
      const eA = mlbBatterFull();
      const eB = mlbBatterFull({
        flatOverrides: {
          steals: '5', // big SB game
          blocks: '5', // many walks
          assists: '5',
        },
        extrasOverrides: {
          hbp: '5',
          runs: '5',
        },
      });
      expect(extractStatForPropViaRegistry('Fantasy Score', 'MLB', eA, 'underdog', FS_OPTS)).toBe(
        extractStatForPropViaRegistry('Fantasy Score', 'MLB', eB, 'underdog', FS_OPTS),
      );
    });

    test('a missing TB component → null', () => {
      const e = mlbBatterFull({ extrasOverrides: { triples: '-' } });
      expect(
        extractStatForPropViaRegistry('Fantasy Score', 'MLB', e, 'underdog', FS_OPTS),
      ).toBeNull();
    });

    test('peripherals missing is fine (Underdog formula does not read them)', () => {
      const e = mlbBatterFull({
        flatOverrides: { steals: '-' },
        extrasOverrides: { runs: '-', hbp: '-' },
      });
      expect(extractStatForPropViaRegistry('Fantasy Score', 'MLB', e, 'underdog', FS_OPTS)).toBe(
        11,
      );
    });

    test('production behaviour: HBP-absent shape is fine for Underdog (formula does not read it)', () => {
      const e = mlbBatterFull({ extrasOverrides: { hbp: undefined } });
      expect(extractStatForPropViaRegistry('Fantasy Score', 'MLB', e, 'underdog', FS_OPTS)).toBe(
        11,
      );
    });
  });

  describe('app parameter routes correctly', () => {
    test('same propType + same entry → different scores per app', () => {
      const e = mlbBatterFull();
      const pp = extractStatForPropViaRegistry('Hitter FS', 'MLB', e, 'prizepicks', FS_OPTS);
      const ud = extractStatForPropViaRegistry('Hitter FS', 'MLB', e, 'underdog', FS_OPTS);
      expect(pp).not.toBe(ud);
      expect(pp).toBe(48);
      expect(ud).toBe(11);
    });

    test('both keys route to the same dispatcher', () => {
      const e = mlbBatterFull();
      expect(extractStatForPropViaRegistry('Hitter FS', 'MLB', e, 'prizepicks', FS_OPTS)).toBe(
        extractStatForPropViaRegistry('Fantasy Score', 'MLB', e, 'prizepicks', FS_OPTS),
      );
      expect(extractStatForPropViaRegistry('Hitter FS', 'MLB', e, 'underdog', FS_OPTS)).toBe(
        extractStatForPropViaRegistry('Fantasy Score', 'MLB', e, 'underdog', FS_OPTS),
      );
    });
  });
});
