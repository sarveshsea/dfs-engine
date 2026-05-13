/**
 * Tests for the per-league adapter registry.
 *
 * Built-in registration is global and idempotent. To avoid test pollution,
 * each test that mutates the registry saves the prior table and restores
 * it (no Vitest beforeEach/afterEach — vitest globals are on, so just
 * inline the save/restore). For the "added league" cases, we unregister
 * the test league at the end.
 */
import {
  registerLeague,
  unregisterLeague,
  getRegisteredLeagues,
  getStatAdapter,
  extractStatForPropViaRegistry,
  type AdapterTable,
} from '../src/stat-adapters';

describe('registry — built-ins', () => {
  test('all expected built-in sports are registered', () => {
    const leagues = getRegisteredLeagues();
    expect(leagues).toEqual(
      expect.arrayContaining(['NBA', 'WNBA', 'NCAAM', 'NCAAW', 'NFL', 'MLB', 'NHL']),
    );
  });

  test('built-in lookups still resolve', () => {
    expect(getStatAdapter('NBA')).not.toBeNull();
    expect(getStatAdapter('NFL')).not.toBeNull();
    expect(getStatAdapter('MLB')).not.toBeNull();
    expect(getStatAdapter('NHL')).not.toBeNull();
  });

  test('league lookup is case-insensitive', () => {
    expect(getStatAdapter('nba')).not.toBeNull();
    expect(getStatAdapter('Nba')).not.toBeNull();
    expect(getStatAdapter('NHL')).toEqual(getStatAdapter('nhl'));
  });

  test('unknown league returns null (not throws)', () => {
    expect(getStatAdapter('CRICKET')).toBeNull();
    expect(getStatAdapter('IPL')).toBeNull();
    expect(getStatAdapter('')).toBeNull();
  });
});

describe('registerLeague / unregisterLeague', () => {
  test('register adds a league + lookup resolves', () => {
    const customAdapters: AdapterTable = {
      Points: () => 42,
    };
    registerLeague('TESTLEAGUE', customAdapters);
    expect(getStatAdapter('TESTLEAGUE')).toBe(customAdapters);
    expect(getRegisteredLeagues()).toContain('TESTLEAGUE');
    unregisterLeague('TESTLEAGUE');
  });

  test('register is case-insensitive on lookup', () => {
    registerLeague('XYZ', { Points: () => 1 });
    expect(getStatAdapter('xyz')).not.toBeNull();
    expect(getStatAdapter('Xyz')).not.toBeNull();
    unregisterLeague('XYZ');
  });

  test('re-registering replaces the table', () => {
    const a: AdapterTable = { Points: () => 1 };
    const b: AdapterTable = { Points: () => 2 };
    registerLeague('TMP', a);
    registerLeague('TMP', b);
    expect(getStatAdapter('TMP')).toBe(b);
    unregisterLeague('TMP');
  });

  test('register throws on empty league key', () => {
    expect(() => registerLeague('', { Points: () => 1 })).toThrow();
  });

  test('unregister returns true when removed, false otherwise', () => {
    registerLeague('TODELETE', { Points: () => 1 });
    expect(unregisterLeague('TODELETE')).toBe(true);
    expect(unregisterLeague('TODELETE')).toBe(false);
    expect(unregisterLeague('NEVER_EXISTED')).toBe(false);
    expect(unregisterLeague('')).toBe(false);
  });

  test('extractStatForPropViaRegistry routes through the custom adapter', () => {
    registerLeague('SOCCER', {
      Goals: (entry) => parseInt(entry.points, 10) || 0,
    });
    // The new league must also have the prop key in DfsPropTypeKey. 'Goals'
    // is already canonical (used by NHL); reusing demonstrates that prop
    // keys are shared across sports.
    const entry = {
      date: '2026-05-04',
      minutes: '90:00',
      points: '2',
      rebounds: '',
      assists: '',
      steals: '',
      blocks: '',
      turnovers: '',
      threeP: '',
    };
    expect(extractStatForPropViaRegistry('Goals', 'SOCCER', entry, 'prizepicks')).toBe(2);
    expect(extractStatForPropViaRegistry('Goals', 'soccer', entry, 'prizepicks')).toBe(2);
    unregisterLeague('SOCCER');
    expect(extractStatForPropViaRegistry('Goals', 'SOCCER', entry, 'prizepicks')).toBeNull();
  });
});
