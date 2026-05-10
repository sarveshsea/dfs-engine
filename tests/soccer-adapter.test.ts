/**
 * Tests for the v1.0 Soccer adapter — first non-US-major built-in sport.
 *
 * Also exercises the plugin-registry route end-to-end: the SOCCER_ADAPTERS
 * table is registered for EPL/MLS/LALIGA/NWSL/UCL via stat-adapters/index.
 */
import {
  asDfsPropTypeKey,
  extractStatForPropViaRegistry,
  getRegisteredLeagues,
  getStatAdapter,
  SOCCER_ADAPTERS,
} from '../src';
import type { PlayerGameLogEntryShape } from '../src';

function soccer(overrides: Partial<PlayerGameLogEntryShape['soccer']> = {}): PlayerGameLogEntryShape {
  return {
    date: '2026-05-10',
    minutes: '90:00',
    points: '2', // Goals
    rebounds: '1', // Assists
    assists: '',
    steals: '',
    blocks: '',
    turnovers: '',
    threeP: '',
    soccer: {
      shots: '5',
      shotsOnTarget: '3',
      passesCompleted: '74',
      passesAttempted: '85',
      tackles: '3',
      yellowCards: '0',
      passAccuracy: '0.87',
      ...overrides,
    },
  };
}

describe('Soccer registry coverage', () => {
  test('all five soccer leagues registered', () => {
    const leagues = getRegisteredLeagues();
    for (const l of ['EPL', 'MLS', 'LALIGA', 'NWSL', 'UCL']) {
      expect(leagues).toContain(l);
    }
  });

  test('every soccer league resolves to SOCCER_ADAPTERS', () => {
    for (const l of ['EPL', 'MLS', 'LALIGA', 'NWSL', 'UCL']) {
      expect(getStatAdapter(l)).toBe(SOCCER_ADAPTERS);
    }
  });

  test('league lookup remains case-insensitive', () => {
    expect(getStatAdapter('epl')).toBe(SOCCER_ADAPTERS);
    expect(getStatAdapter('LaLiga')).toBe(SOCCER_ADAPTERS);
  });
});

describe('Soccer adapters — happy path', () => {
  const e = soccer();

  test.each([
    ['Goals', 2],
    ['Assists', 1],
    ['Shots', 5],
    ['Shots on Target', 3],
    ['Passes Completed', 74],
    ['Tackles', 3],
  ])('EPL %s → %s', (prop, expected) => {
    expect(extractStatForPropViaRegistry(prop, 'EPL', e, 'prizepicks')).toBe(expected);
  });

  test('Yellow Cards: 0 → 0 (clean game)', () => {
    expect(extractStatForPropViaRegistry('Yellow Cards', 'EPL', e, 'prizepicks')).toBe(0);
  });

  test('Yellow Cards: 1 → 1 (book line at 0.5)', () => {
    const carded = soccer({ yellowCards: '1' });
    expect(extractStatForPropViaRegistry('Yellow Cards', 'EPL', carded, 'prizepicks')).toBe(1);
  });

  test('Yellow Cards: 2+ → 1 (still treated as "got carded")', () => {
    const twoCards = soccer({ yellowCards: '2' });
    expect(extractStatForPropViaRegistry('Yellow Cards', 'EPL', twoCards, 'prizepicks')).toBe(1);
  });
});

describe('Soccer Pass Accuracy — decimal vs percent normalization', () => {
  test('decimal: "0.87" → 87', () => {
    const e = soccer({ passAccuracy: '0.87' });
    expect(extractStatForPropViaRegistry('Pass Accuracy', 'EPL', e, 'prizepicks')).toBe(87);
  });

  test('leading-dot decimal: ".87" → 87', () => {
    const e = soccer({ passAccuracy: '.87' });
    expect(extractStatForPropViaRegistry('Pass Accuracy', 'EPL', e, 'prizepicks')).toBe(87);
  });

  test('percent integer: "87" → 87', () => {
    const e = soccer({ passAccuracy: '87' });
    expect(extractStatForPropViaRegistry('Pass Accuracy', 'EPL', e, 'prizepicks')).toBe(87);
  });

  test('percent float: "87.5" → 87.5', () => {
    const e = soccer({ passAccuracy: '87.5' });
    expect(extractStatForPropViaRegistry('Pass Accuracy', 'EPL', e, 'prizepicks')).toBe(87.5);
  });

  test('null on "-"', () => {
    const e = soccer({ passAccuracy: '-' });
    expect(extractStatForPropViaRegistry('Pass Accuracy', 'EPL', e, 'prizepicks')).toBeNull();
  });

  test('edge: 1.0 → 100', () => {
    const e = soccer({ passAccuracy: '1.0' });
    expect(extractStatForPropViaRegistry('Pass Accuracy', 'EPL', e, 'prizepicks')).toBe(100);
  });
});

describe('Soccer adapters — null handling', () => {
  test('absent soccer subobject → null on soccer-specific props', () => {
    const noSoccer: PlayerGameLogEntryShape = {
      date: '2026-05-10',
      minutes: '90:00',
      points: '2',
      rebounds: '1',
      assists: '',
      steals: '',
      blocks: '',
      turnovers: '',
      threeP: '',
    };
    expect(extractStatForPropViaRegistry('Shots', 'EPL', noSoccer, 'prizepicks')).toBeNull();
    expect(extractStatForPropViaRegistry('Tackles', 'EPL', noSoccer, 'prizepicks')).toBeNull();
    // Goals + Assists still work because they read flat fields
    expect(extractStatForPropViaRegistry('Goals', 'EPL', noSoccer, 'prizepicks')).toBe(2);
  });

  test('null when specific soccer field missing', () => {
    const e = soccer({ shots: undefined });
    expect(extractStatForPropViaRegistry('Shots', 'EPL', e, 'prizepicks')).toBeNull();
  });

  test('null on yellow cards field missing', () => {
    const e = soccer({ yellowCards: undefined });
    expect(extractStatForPropViaRegistry('Yellow Cards', 'EPL', e, 'prizepicks')).toBeNull();
  });
});

describe('Soccer alias resolution', () => {
  test.each([
    ['SOT', 'Shots on Target'],
    ['shots on target', 'Shots on Target'],
    ['tkl', 'Tackles'],
    ['tackles', 'Tackles'],
    ['yc', 'Yellow Cards'],
    ['yellow cards', 'Yellow Cards'],
    ['pass %', 'Pass Accuracy'],
    ['pass accuracy', 'Pass Accuracy'],
    ['passes', 'Passes Completed'],
    ['completed passes', 'Passes Completed'],
    ['SOT', 'Shots on Target'],
  ])('"%s" → %s', (input, expected) => {
    expect(asDfsPropTypeKey(input)).toBe(expected);
  });
});

describe('Soccer × NHL prop-name overlap (per-league dispatch)', () => {
  // Canonical "Shots on Goal" stays NHL-specific. Soccer users should
  // use "Shots on Target" / "SOT". This protects NHL bets from being
  // silently misrouted when a soccer alias overrides.
  test('"Shots on Target" works for soccer', () => {
    const e = soccer();
    expect(extractStatForPropViaRegistry('Shots on Target', 'EPL', e, 'prizepicks')).toBe(3);
    expect(extractStatForPropViaRegistry('SOT', 'EPL', e, 'prizepicks')).toBe(3);
  });
});
