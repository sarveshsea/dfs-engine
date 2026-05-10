/**
 * Tests for shouldWriteLiveActual, buildLiveSnapshot, buildLiveLegAlertTitle.
 *
 * The live-watcher path is small but load-bearing: a single bad
 * `shouldWriteLiveActual` lets transient ESPN nulls clobber real values
 * mid-game. These pins catch that.
 */
import {
  shouldWriteLiveActual,
  buildLiveSnapshot,
  buildLiveLegAlertTitle,
} from '../src/live-helpers';

describe('shouldWriteLiveActual', () => {
  test('null extracted never writes (transient ESPN miss)', () => {
    expect(shouldWriteLiveActual(null, null)).toBe(false);
    expect(shouldWriteLiveActual(null, 14)).toBe(false);
  });

  test('Infinity / NaN never writes', () => {
    expect(shouldWriteLiveActual(Infinity, null)).toBe(false);
    expect(shouldWriteLiveActual(NaN, null)).toBe(false);
    expect(shouldWriteLiveActual(-Infinity, 5)).toBe(false);
  });

  test('equal-to-current is a no-op (skip MVCC churn)', () => {
    expect(shouldWriteLiveActual(14, 14)).toBe(false);
    expect(shouldWriteLiveActual(0, 0)).toBe(false);
  });

  test('first non-null value writes', () => {
    expect(shouldWriteLiveActual(0, null)).toBe(true);
    expect(shouldWriteLiveActual(14, null)).toBe(true);
  });

  test('different finite values write (monotonic advance)', () => {
    expect(shouldWriteLiveActual(15, 14)).toBe(true);
    expect(shouldWriteLiveActual(14, 0)).toBe(true);
  });
});

describe('buildLiveSnapshot', () => {
  test('returns the expected shape with default source', () => {
    expect(buildLiveSnapshot(14, '2026-05-04T22:14:11Z')).toEqual({
      actualValue: 14,
      lastLiveStatAt: '2026-05-04T22:14:11Z',
      source: 'espn-summary',
    });
  });

  test('respects explicit boxscore source', () => {
    expect(
      buildLiveSnapshot(28, '2026-05-04T22:14:11Z', 'espn-boxscore'),
    ).toEqual({
      actualValue: 28,
      lastLiveStatAt: '2026-05-04T22:14:11Z',
      source: 'espn-boxscore',
    });
  });
});

describe('buildLiveLegAlertTitle', () => {
  test('won + over → ⚡ ... hit', () => {
    expect(
      buildLiveLegAlertTitle({
        playerName: 'Brunson',
        propType: 'PTS',
        line: 33.5,
        direction: 'over',
        actualValue: 35,
        status: 'won',
      }),
    ).toBe('⚡ Brunson 35 PTS — over 33.5 hit');
  });

  test('won + under → ⚡ ... hit', () => {
    expect(
      buildLiveLegAlertTitle({
        playerName: 'Brunson',
        propType: 'PTS',
        line: 33.5,
        direction: 'under',
        actualValue: 14,
        status: 'won',
      }),
    ).toBe('⚡ Brunson 14 PTS — under 33.5 hit');
  });

  test('lost + over → 💔 ... missed', () => {
    expect(
      buildLiveLegAlertTitle({
        playerName: 'Brunson',
        propType: 'PTS',
        line: 33.5,
        direction: 'over',
        actualValue: 14,
        status: 'lost',
      }),
    ).toBe('💔 Brunson 14 PTS — over 33.5 missed');
  });

  test('lost + under → 💔 ... busted', () => {
    expect(
      buildLiveLegAlertTitle({
        playerName: 'Brunson',
        propType: 'PTS',
        line: 33.5,
        direction: 'under',
        actualValue: 35,
        status: 'lost',
      }),
    ).toBe('💔 Brunson 35 PTS — under 33.5 busted');
  });
});
