/**
 * Tests for gradeDfsBetFromGraded — the top-level entry-level grader.
 *
 * Previously only exercised transitively through dfs-settlement-service
 * (which we didn't port). These tests pin the contract directly:
 *
 *   - Power all-hit → won, totalPayout = stake × displayedMultiplier
 *   - Power any-loss → lost, payouts zero
 *   - Flex partial-hit → won/lost per schedule, multiplier scaled
 *     proportionally so any displayed boost flows through
 *   - Pending: any 'pending' surviving leg → bet stays pending
 *   - DNP filtering: 'dnp' legs are excluded before the count
 *   - Boost split: Underdog with baseMultiplier vs displayedMultiplier
 *     surfaces a non-zero bonus
 */
import { gradeDfsBetFromGraded } from '../src/grading';
import type { DfsBetLeg, DfsLegStatus } from '../src/types';

function leg(legId: string, legStatus: DfsLegStatus): DfsBetLeg {
  // Minimal DfsBetLeg — gradeDfsBetFromGraded only reads legStatus + legId.
  return {
    legId,
    playerName: 'Test Player',
    playerTeam: null,
    playerPosition: null,
    playerNumber: null,
    playerAthleteId: null,
    linkage: null,
    propType: 'Points',
    line: 24.5,
    direction: 'over',
    league: 'NBA',
    gameContext: {
      raw: '',
      homeTeam: null,
      awayTeam: null,
      homeScore: null,
      awayScore: null,
      state: 'final',
      clock: null,
      startTime: null,
      gameId: null,
      gameDate: null,
      gameStartTime: null,
      dayOfWeek: null,
      stateCode: null,
    },
    actualValue: null,
    legStatus,
    boostType: 'standard',
    liveSnapshot: null,
    gradingSnapshot: null,
  };
}

describe('gradeDfsBetFromGraded — PrizePicks Power', () => {
  test('all-hit 5-pick → won, payout = stake × multiplier', () => {
    const result = gradeDfsBetFromGraded({
      app: 'prizepicks',
      playType: 'power',
      legs: [leg('a', 'won'), leg('b', 'won'), leg('c', 'won'), leg('d', 'won'), leg('e', 'won')],
      stake: 10,
      displayedMultiplier: 20,
      baseMultiplier: 20,
      profitBoostPct: null,
    });
    expect(result.status).toBe('won');
    expect(result.totalPayout).toBe(200);
    expect(result.bonusPayout).toBe(0); // PrizePicks has no bonus split
    expect(result.withdrawablePayout).toBe(200);
    expect(result.effectiveMultiplier).toBe(20);
  });

  test('one-loss 5-pick → lost, payouts zero', () => {
    const result = gradeDfsBetFromGraded({
      app: 'prizepicks',
      playType: 'power',
      legs: [leg('a', 'won'), leg('b', 'won'), leg('c', 'lost'), leg('d', 'won'), leg('e', 'won')],
      stake: 10,
      displayedMultiplier: 20,
      baseMultiplier: 20,
      profitBoostPct: null,
    });
    expect(result.status).toBe('lost');
    expect(result.totalPayout).toBe(0);
    expect(result.withdrawablePayout).toBe(0);
    expect(result.bonusPayout).toBe(0);
  });
});

describe('gradeDfsBetFromGraded — PrizePicks Flex', () => {
  test('6-of-6 hit → won, max multiplier applied', () => {
    const result = gradeDfsBetFromGraded({
      app: 'prizepicks',
      playType: 'flex',
      legs: Array.from({ length: 6 }, (_, i) => leg(`l${i}`, 'won')),
      stake: 10,
      displayedMultiplier: 25,
      baseMultiplier: 25,
      profitBoostPct: null,
    });
    expect(result.status).toBe('won');
    expect(result.totalPayout).toBe(250);
  });

  test('5-of-6 hit → partial payout per schedule', () => {
    // PrizePicks 6-pick Flex pays 1.75× on 5 hits.
    const result = gradeDfsBetFromGraded({
      app: 'prizepicks',
      playType: 'flex',
      legs: [
        leg('a', 'won'),
        leg('b', 'won'),
        leg('c', 'won'),
        leg('d', 'won'),
        leg('e', 'won'),
        leg('f', 'lost'),
      ],
      stake: 10,
      displayedMultiplier: 25,
      baseMultiplier: 25,
      profitBoostPct: null,
    });
    expect(result.status).toBe('won');
    // Scaled: 25 × (1.75 / 25) = 1.75
    expect(result.effectiveMultiplier).toBe(1.75);
    expect(result.totalPayout).toBe(17.5);
  });

  test('3-of-6 hit → lost (below the schedule floor)', () => {
    const result = gradeDfsBetFromGraded({
      app: 'prizepicks',
      playType: 'flex',
      legs: [
        leg('a', 'won'),
        leg('b', 'won'),
        leg('c', 'won'),
        leg('d', 'lost'),
        leg('e', 'lost'),
        leg('f', 'lost'),
      ],
      stake: 10,
      displayedMultiplier: 25,
      baseMultiplier: 25,
      profitBoostPct: null,
    });
    expect(result.status).toBe('lost');
    expect(result.totalPayout).toBe(0);
    expect(result.effectiveMultiplier).toBe(0);
  });
});

describe('gradeDfsBetFromGraded — pending semantics', () => {
  test('any pending surviving leg keeps the bet pending', () => {
    const result = gradeDfsBetFromGraded({
      app: 'prizepicks',
      playType: 'power',
      legs: [leg('a', 'won'), leg('b', 'won'), leg('c', 'pending')],
      stake: 10,
      displayedMultiplier: 5,
      baseMultiplier: 5,
      profitBoostPct: null,
    });
    expect(result.status).toBe('pending');
    expect(result.totalPayout).toBe(0);
  });

  test('pending wins over partial loss (still pending)', () => {
    const result = gradeDfsBetFromGraded({
      app: 'prizepicks',
      playType: 'power',
      legs: [leg('a', 'lost'), leg('b', 'pending')],
      stake: 10,
      displayedMultiplier: 3,
      baseMultiplier: 3,
      profitBoostPct: null,
    });
    expect(result.status).toBe('pending');
  });
});

describe('gradeDfsBetFromGraded — DNP filtering', () => {
  test('dnp legs are excluded before the count', () => {
    // Original 5-pick demoted to 4-pick by one DNP; all 4 surviving hit.
    const result = gradeDfsBetFromGraded({
      app: 'prizepicks',
      playType: 'power',
      legs: [leg('a', 'won'), leg('b', 'won'), leg('c', 'won'), leg('d', 'won'), leg('e', 'dnp')],
      stake: 10,
      displayedMultiplier: 10, // caller has already recomputed via applyLegDnp
      baseMultiplier: 10,
      profitBoostPct: null,
    });
    expect(result.status).toBe('won');
    expect(result.totalPayout).toBe(100);
  });
});

describe('gradeDfsBetFromGraded — Underdog Standard', () => {
  test('all-hit → won, no bonus split when displayed === base', () => {
    const result = gradeDfsBetFromGraded({
      app: 'underdog',
      playType: 'underdog_standard',
      legs: [leg('a', 'won'), leg('b', 'won'), leg('c', 'won')],
      stake: 10,
      displayedMultiplier: 6,
      baseMultiplier: 6,
      profitBoostPct: null,
    });
    expect(result.status).toBe('won');
    expect(result.totalPayout).toBe(60);
    expect(result.bonusPayout).toBe(0);
    expect(result.withdrawablePayout).toBe(60);
  });

  test('boost split: displayed > base → bonus portion is non-zero', () => {
    // Underdog 3-pick standard base 6x, slip shows 7.5x (boosted).
    const result = gradeDfsBetFromGraded({
      app: 'underdog',
      playType: 'underdog_standard',
      legs: [leg('a', 'won'), leg('b', 'won'), leg('c', 'won')],
      stake: 10,
      displayedMultiplier: 7.5,
      baseMultiplier: 6,
      profitBoostPct: null,
    });
    expect(result.status).toBe('won');
    expect(result.totalPayout).toBe(75);
    // bonus = stake × (multiplier - baseMultiplier) = 10 × 1.5 = 15
    expect(result.bonusPayout).toBe(15);
    expect(result.withdrawablePayout).toBe(60);
  });
});
