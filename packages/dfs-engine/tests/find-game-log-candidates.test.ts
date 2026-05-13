/**
 * Tests for findGameLogCandidates + matchGameLogEntry.
 *
 * Coverage:
 *   - The v0.2 fix: null/unparseable hint returns [] by default,
 *     [entries[0]] with `assumeFirst: true`.
 *   - Window math (±36h default, ±opts.window override).
 *   - Forward-bias when both candidates fall on either side of the hint.
 *   - Doubleheader ambiguity surfacing.
 *   - matchGameLogEntry delegates to findGameLogCandidates including opts.
 */
import { findGameLogCandidates, matchGameLogEntry } from '../src/grading';

type Entry = {
  date: string;
  minutes: string;
  points: string;
  rebounds: string;
  assists: string;
  steals: string;
  blocks: string;
  turnovers: string;
  threeP: string;
};

const e = (date: string): Entry => ({
  date,
  minutes: '0',
  points: '0',
  rebounds: '0',
  assists: '0',
  steals: '0',
  blocks: '0',
  turnovers: '0',
  threeP: '0',
});

const ISO = (d: string, t: string = '20:00:00Z') => `${d}T${t}`;

describe('findGameLogCandidates — null/unparseable hint (v0.2 fix)', () => {
  test('empty entries always returns []', () => {
    expect(findGameLogCandidates(null, [])).toEqual([]);
    expect(findGameLogCandidates(ISO('2026-05-04'), [])).toEqual([]);
  });

  test('null hint returns [] by default (was [entries[0]] in v0.0.1)', () => {
    const entries = [e(ISO('2026-05-04')), e(ISO('2026-05-03'))];
    expect(findGameLogCandidates(null, entries)).toEqual([]);
  });

  test('null hint with assumeFirst:true returns [entries[0]] (legacy)', () => {
    const entries = [e(ISO('2026-05-04')), e(ISO('2026-05-03'))];
    expect(findGameLogCandidates(null, entries, { assumeFirst: true })).toEqual([entries[0]]);
  });

  test('unparseable hint returns [] by default', () => {
    const entries = [e(ISO('2026-05-04'))];
    expect(findGameLogCandidates('not-a-date', entries)).toEqual([]);
  });

  test('unparseable hint with assumeFirst:true returns [entries[0]]', () => {
    const entries = [e(ISO('2026-05-04'))];
    expect(findGameLogCandidates('not-a-date', entries, { assumeFirst: true })).toEqual([
      entries[0],
    ]);
  });
});

describe('findGameLogCandidates — window + forward bias', () => {
  test('returns entry within ±36h default window', () => {
    const entries = [e(ISO('2026-05-04'))];
    expect(findGameLogCandidates(ISO('2026-05-04'), entries)).toEqual(entries);
  });

  test('drops entries outside the ±36h window', () => {
    const entries = [
      e(ISO('2026-05-04')),
      e(ISO('2026-05-01')), // ~3 days out
    ];
    const matches = findGameLogCandidates(ISO('2026-05-04'), entries);
    expect(matches).toEqual([entries[0]]);
  });

  test('forward-bias: later entry wins when both within window', () => {
    const earlier = e(ISO('2026-05-03', '21:00:00Z')); // 23h before hint
    const later = e(ISO('2026-05-05', '00:00:00Z')); // 4h after hint
    const matches = findGameLogCandidates(ISO('2026-05-04', '20:00:00Z'), [earlier, later]);
    expect(matches).toEqual([later]);
  });

  test('opts.window tightens the search', () => {
    const entries = [e(ISO('2026-05-03', '00:00:00Z'))]; // ~20h before
    expect(
      findGameLogCandidates(ISO('2026-05-04', '20:00:00Z'), entries, {
        window: 1 * 60 * 60 * 1000, // 1h
      }),
    ).toEqual([]);
  });

  test('returns empty when no entry in window', () => {
    const entries = [e(ISO('2026-05-01'))];
    expect(findGameLogCandidates(ISO('2026-05-04'), entries)).toEqual([]);
  });
});

describe('findGameLogCandidates — doubleheader ambiguity', () => {
  test('returns both entries when top two are within ±12h of each other', () => {
    // Two games on same day, 4 hours apart — classic MLB doubleheader
    const game1 = e(ISO('2026-05-04', '13:00:00Z'));
    const game2 = e(ISO('2026-05-04', '17:00:00Z'));
    const matches = findGameLogCandidates(ISO('2026-05-04', '20:00:00Z'), [game1, game2]);
    expect(matches.length).toBe(2);
  });

  test('returns single entry when second-best is >12h from first-best', () => {
    const main = e(ISO('2026-05-04', '20:00:00Z'));
    const dayBefore = e(ISO('2026-05-03', '20:00:00Z'));
    const matches = findGameLogCandidates(ISO('2026-05-04', '20:00:00Z'), [main, dayBefore]);
    expect(matches).toEqual([main]);
  });
});

describe('matchGameLogEntry — single-answer wrapper', () => {
  test('null hint returns null (v0.2 fix)', () => {
    expect(matchGameLogEntry(null, [e(ISO('2026-05-04'))])).toBeNull();
  });

  test('null hint with assumeFirst:true returns first entry', () => {
    const entries = [e(ISO('2026-05-04'))];
    expect(matchGameLogEntry(null, entries, { assumeFirst: true })).toBe(entries[0]);
  });

  test('passes window opt through to findGameLogCandidates', () => {
    const entries = [e(ISO('2026-05-03', '00:00:00Z'))];
    expect(
      matchGameLogEntry(ISO('2026-05-04', '20:00:00Z'), entries, {
        window: 1 * 60 * 60 * 1000,
      }),
    ).toBeNull();
  });
});
