/**
 * Tests for DFS payout schedules + DNP demotion math.
 *
 * Schedules are reference values current as of 2026-05; if either app
 * publishes new payouts these tests will fail loudly so we know to update
 * dfs-payouts.ts in lockstep.
 */
import {
  lookupBaseMultiplier,
  lookupStandardMultiplier,
  recalcMultiplierAfterDnp,
} from '../src/payouts';

describe('dfs-payouts: lookupStandardMultiplier', () => {
  test('PrizePicks Power 6-pick all-hit = 37.5x', () => {
    expect(
      lookupStandardMultiplier({ app: 'prizepicks', playType: 'power', pickCount: 6, hits: 6 }),
    ).toBe(37.5);
  });

  test('PrizePicks Flex 6-pick partial hits cascade', () => {
    expect(
      lookupStandardMultiplier({ app: 'prizepicks', playType: 'flex', pickCount: 6, hits: 6 }),
    ).toBe(25);
    expect(
      lookupStandardMultiplier({ app: 'prizepicks', playType: 'flex', pickCount: 6, hits: 5 }),
    ).toBe(1.75);
    expect(
      lookupStandardMultiplier({ app: 'prizepicks', playType: 'flex', pickCount: 6, hits: 4 }),
    ).toBe(0.4);
  });

  test('Underdog Standard 4-pick all-hit = 10x', () => {
    expect(
      lookupStandardMultiplier({
        app: 'underdog',
        playType: 'underdog_standard',
        pickCount: 4,
        hits: 4,
      }),
    ).toBe(10);
  });

  test('returns null for unknown tuples', () => {
    // 1-pick doesn't exist in either schedule.
    expect(
      lookupStandardMultiplier({ app: 'prizepicks', playType: 'power', pickCount: 1, hits: 1 }),
    ).toBeNull();
    // Flex 3/6 falls below the floor.
    expect(
      lookupStandardMultiplier({ app: 'prizepicks', playType: 'flex', pickCount: 6, hits: 3 }),
    ).toBeNull();
  });

  test('lookupBaseMultiplier matches all-hit standard', () => {
    expect(lookupBaseMultiplier({ app: 'prizepicks', playType: 'power', pickCount: 4 })).toBe(10);
    expect(
      lookupBaseMultiplier({ app: 'underdog', playType: 'underdog_standard', pickCount: 5 }),
    ).toBe(20);
  });
});

describe('dfs-payouts: recalcMultiplierAfterDnp', () => {
  test('Power 6-pick demotes to 5-pick proportionally', () => {
    // Slip showed 37.5x; one DNP demotes the play. 5-pick all-hit = 20x → ratio 20/37.5 ≈ 0.5333.
    const result = recalcMultiplierAfterDnp({
      app: 'prizepicks',
      playType: 'power',
      originalPickCount: 6,
      survivingPickCount: 5,
      survivingHits: 5,
      originalMultiplier: 37.5,
    });
    expect(result.usedFallback).toBe(false);
    expect(result.newMultiplier).toBeCloseTo(20, 4);
  });

  test('demotion preserves Demon/Goblin scaling', () => {
    // Original slip displayed 50x (boosted from standard 37.5x). A demotion should
    // scale to 50 × (20 / 37.5) ≈ 26.67x - preserving the boost ratio.
    const result = recalcMultiplierAfterDnp({
      app: 'prizepicks',
      playType: 'power',
      originalPickCount: 6,
      survivingPickCount: 5,
      survivingHits: 5,
      originalMultiplier: 50,
    });
    expect(result.usedFallback).toBe(false);
    expect(result.newMultiplier).toBeCloseTo(26.6667, 3);
  });

  test('Flex demotion uses surviving hit count', () => {
    // 5-pick flex → 4-pick flex at 4/4 hits.
    // PP 5-pick all-hit = 10x; PP 4-pick all-hit (flex) = 5x → ratio 0.5.
    const result = recalcMultiplierAfterDnp({
      app: 'prizepicks',
      playType: 'flex',
      originalPickCount: 5,
      survivingPickCount: 4,
      survivingHits: 4,
      originalMultiplier: 10,
    });
    expect(result.usedFallback).toBe(false);
    expect(result.newMultiplier).toBeCloseTo(5, 4);
  });

  test('falls back when survivingPickCount is invalid', () => {
    const r1 = recalcMultiplierAfterDnp({
      app: 'prizepicks',
      playType: 'power',
      originalPickCount: 4,
      survivingPickCount: 0,
      survivingHits: 0,
      originalMultiplier: 10,
    });
    expect(r1.usedFallback).toBe(true);
    expect(r1.newMultiplier).toBe(0);

    const r2 = recalcMultiplierAfterDnp({
      app: 'prizepicks',
      playType: 'power',
      originalPickCount: 4,
      survivingPickCount: 5,
      survivingHits: 5,
      originalMultiplier: 10,
    });
    expect(r2.usedFallback).toBe(true);
  });

  test('falls back when schedule lookup misses', () => {
    // 1-pick doesn't exist in any schedule.
    const result = recalcMultiplierAfterDnp({
      app: 'prizepicks',
      playType: 'power',
      originalPickCount: 2,
      survivingPickCount: 1,
      survivingHits: 1,
      originalMultiplier: 3,
    });
    expect(result.usedFallback).toBe(true);
    expect(result.newMultiplier).toBe(3);
  });
});
