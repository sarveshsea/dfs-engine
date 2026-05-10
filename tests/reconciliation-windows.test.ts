/**
 * Tests for the per-league reconciliation window helpers (Phase G.write).
 *
 * Pins:
 *   - Window values per league
 *   - "Other leagues silently never reconcile" — including NHL, soccer, and unknown
 *   - Cutoff math: just-before-edge vs. just-after-edge
 *   - Future-dated settledAt (clock skew) is treated as in-window, not skipped
 *   - Case-insensitive on the league key
 *   - MAX is the longest window (NFL = 24h)
 */
import {
  MAX_RECONCILIATION_WINDOW_MS,
  RECONCILIATION_WINDOW_MS,
  SUPPORTED_RECONCILIATION_LEAGUES,
  isWithinReconciliationWindow,
} from '../src/reconciliation-windows';

const HOUR_MS = 60 * 60 * 1000;

describe('RECONCILIATION_WINDOW_MS', () => {
  test('pins the locked windows', () => {
    // These values are the design lock from the G.write Q&A. Changing
    // them affects when settled bets stop being reconciled — coordinate
    // with product before bumping.
    expect(RECONCILIATION_WINDOW_MS.NBA).toBe(2 * HOUR_MS);
    expect(RECONCILIATION_WINDOW_MS.WNBA).toBe(2 * HOUR_MS);
    expect(RECONCILIATION_WINDOW_MS.NFL).toBe(24 * HOUR_MS);
    expect(RECONCILIATION_WINDOW_MS.MLB).toBe(6 * HOUR_MS);
  });

  test('NHL and soccer leagues are intentionally absent', () => {
    expect(RECONCILIATION_WINDOW_MS.NHL).toBeUndefined();
    expect(RECONCILIATION_WINDOW_MS.MLS).toBeUndefined();
    expect(RECONCILIATION_WINDOW_MS.EPL).toBeUndefined();
  });

  test('SUPPORTED_RECONCILIATION_LEAGUES matches the keys', () => {
    expect(new Set(SUPPORTED_RECONCILIATION_LEAGUES)).toEqual(
      new Set(Object.keys(RECONCILIATION_WINDOW_MS)),
    );
  });

  test('MAX_RECONCILIATION_WINDOW_MS = NFL window', () => {
    expect(MAX_RECONCILIATION_WINDOW_MS).toBe(24 * HOUR_MS);
  });
});

describe('isWithinReconciliationWindow', () => {
  const NOW = new Date('2026-05-05T12:00:00Z').getTime();

  describe('unsupported leagues', () => {
    test.each([
      ['NHL', 'silently skipped — no empirical window'],
      ['MLS', 'silently skipped — no extractStatForProp coverage'],
      ['EPL', 'silently skipped'],
      ['UFC', 'silently skipped'],
      ['', 'empty league'],
    ])('returns false for %s (%s)', (league) => {
      expect(
        isWithinReconciliationWindow(league, new Date(NOW - 30 * 60 * 1000).toISOString(), NOW),
      ).toBe(false);
    });

    test('returns false for null / undefined league', () => {
      expect(isWithinReconciliationWindow(null, new Date(NOW).toISOString(), NOW)).toBe(false);
      expect(isWithinReconciliationWindow(undefined, new Date(NOW).toISOString(), NOW)).toBe(
        false,
      );
    });
  });

  describe('cutoff math', () => {
    test('NBA: just-before edge (1h59m elapsed) is in-window', () => {
      const settled = new Date(NOW - (2 * HOUR_MS - 60_000)).toISOString();
      expect(isWithinReconciliationWindow('NBA', settled, NOW)).toBe(true);
    });

    test('NBA: exactly at the edge (2h) is in-window (≤)', () => {
      const settled = new Date(NOW - 2 * HOUR_MS).toISOString();
      expect(isWithinReconciliationWindow('NBA', settled, NOW)).toBe(true);
    });

    test('NBA: just-after edge (2h01s elapsed) is out-of-window', () => {
      const settled = new Date(NOW - (2 * HOUR_MS + 1000)).toISOString();
      expect(isWithinReconciliationWindow('NBA', settled, NOW)).toBe(false);
    });

    test('NFL: 23h59m is in-window', () => {
      const settled = new Date(NOW - (24 * HOUR_MS - 60_000)).toISOString();
      expect(isWithinReconciliationWindow('NFL', settled, NOW)).toBe(true);
    });

    test('NFL: 25h is out-of-window', () => {
      const settled = new Date(NOW - 25 * HOUR_MS).toISOString();
      expect(isWithinReconciliationWindow('NFL', settled, NOW)).toBe(false);
    });

    test('MLB: 5h is in-window, 7h is out', () => {
      expect(
        isWithinReconciliationWindow('MLB', new Date(NOW - 5 * HOUR_MS).toISOString(), NOW),
      ).toBe(true);
      expect(
        isWithinReconciliationWindow('MLB', new Date(NOW - 7 * HOUR_MS).toISOString(), NOW),
      ).toBe(false);
    });
  });

  describe('case-insensitive league key', () => {
    test('lowercased league still matches', () => {
      const settled = new Date(NOW - 30 * 60 * 1000).toISOString();
      expect(isWithinReconciliationWindow('nba', settled, NOW)).toBe(true);
    });
  });

  describe('clock skew tolerance', () => {
    test('future-dated settledAt (negative elapsed) is treated as in-window', () => {
      // Defensive: minor DB↔runtime clock drift shouldn't bounce a just-
      // settled bet out of reconciliation.
      const settled = new Date(NOW + 5_000).toISOString();
      expect(isWithinReconciliationWindow('NBA', settled, NOW)).toBe(true);
    });
  });

  describe('input validation', () => {
    test('null / empty settledAt returns false', () => {
      expect(isWithinReconciliationWindow('NBA', null, NOW)).toBe(false);
      expect(isWithinReconciliationWindow('NBA', '', NOW)).toBe(false);
    });

    test('unparseable settledAt returns false', () => {
      expect(isWithinReconciliationWindow('NBA', 'not-a-date', NOW)).toBe(false);
    });

    test('Date instance accepted alongside ISO string', () => {
      const settled = new Date(NOW - 30 * 60 * 1000);
      expect(isWithinReconciliationWindow('NBA', settled, NOW)).toBe(true);
    });

    test('Date instance for `now` accepted', () => {
      const settled = new Date(NOW - 30 * 60 * 1000);
      expect(isWithinReconciliationWindow('NBA', settled, new Date(NOW))).toBe(true);
    });
  });
});
