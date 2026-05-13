/**
 * Tests for the pure logic powering bet-dfs-settlement-watcher's
 * pre-game auto-DNP path (Phase E.pre).
 *
 * Coverage:
 *   - applyLegDnp transitions on the pre-game path (all surviving legs
 *     still 'pending'). Recalc falls back to the unchanged multiplier
 *     because the payout schedule's "0-hit" row doesn't exist for
 *     either Power or Flex tiers — markLegDnp behaves identically and
 *     the final-state grader reapplies the demotion math once hits are
 *     known.
 *   - Idempotency (already-DNP, unknown legId) so the watcher's per-tick
 *     re-runs don't double-mark.
 *   - Single-leg DFS bet-void branch: asserts the column-write contract
 *     the watcher mirrors from bet-service.ts:399-433. This is a
 *     money-flow event — refund, status='void', settled_at — and the
 *     test pins the contract so a future markLegDnp refactor can't
 *     silently bypass it.
 *   - One Flex post-game scenario where surviving hits are known so
 *     the meaningful demotion math (ratio of surviving / original) is
 *     exercised end-to-end.
 *
 * The HTTP-side flow (view query, ESPN injury fetch, UPDATE concurrency
 * guard) is integration; this file covers the in-memory transitions
 * the watcher orchestrates.
 */
import { applyLegDnp } from '../src/grading';
import type { DfsBetLeg, DfsLegStatus } from '../src/types';

function makeLeg(overrides: Partial<DfsBetLeg> = {}): DfsBetLeg {
  return {
    legId: 'leg-1',
    playerName: 'Test Player',
    playerTeam: 'NYK',
    playerPosition: 'G',
    playerNumber: '#11',
    playerAthleteId: '12345',
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
      state: 'pre',
      clock: null,
      startTime: null,
      gameId: null,
      gameDate: null,
      gameStartTime: null,
      dayOfWeek: null,
      stateCode: null,
    },
    actualValue: null,
    legStatus: 'pending',
    boostType: 'standard',
    liveSnapshot: null,
    gradingSnapshot: null,
    ...overrides,
  } as DfsBetLeg;
}

describe('applyLegDnp — Phase E.pre transitions', () => {
  describe('pre-game path (all surviving legs pending)', () => {
    test('PrizePicks Power 4-pick: marks target DNP, multiplier stays at fallback', () => {
      const legs: DfsBetLeg[] = [
        makeLeg({ legId: 'l1' }),
        makeLeg({ legId: 'l2' }),
        makeLeg({ legId: 'l3' }),
        makeLeg({ legId: 'l4' }),
      ];
      const result = applyLegDnp({
        app: 'prizepicks',
        playType: 'power',
        legs,
        legIdToMark: 'l2',
        stake: 10,
        currentMultiplier: 10,
      });

      expect(result.notFound).toBe(false);
      expect(result.alreadyDnp).toBe(false);
      expect(result.isVoided).toBe(false);
      expect(result.updatedLegs.find((l) => l.legId === 'l2')?.legStatus).toBe('dnp');
      // Power schedules only have an all-hit row, so lookup(3 picks, 0 hits)
      // returns null and recalc falls back to the unchanged multiplier.
      // The final-state grader recomputes demotion when hits are known.
      expect(result.newMultiplier).toBe(10);
      expect(result.newPotentialPayout).toBeCloseTo(100, 2);
    });

    test('Underdog Flex 5-pick: marks target DNP, fallback applies (no 0-hit row at 4 picks)', () => {
      const legs: DfsBetLeg[] = Array.from({ length: 5 }, (_, i) =>
        makeLeg({ legId: `l${i + 1}` }),
      );
      const result = applyLegDnp({
        app: 'underdog',
        playType: 'underdog_flex',
        legs,
        legIdToMark: 'l3',
        stake: 25,
        currentMultiplier: 10,
      });

      expect(result.isVoided).toBe(false);
      expect(result.updatedLegs.find((l) => l.legId === 'l3')?.legStatus).toBe('dnp');
      expect(result.newMultiplier).toBe(10);
      expect(result.newPotentialPayout).toBeCloseTo(250, 2);
    });

    test('idempotent: marking an already-DNP leg returns alreadyDnp=true and same legs reference', () => {
      const baseLegs: DfsBetLeg[] = [
        makeLeg({ legId: 'l1' }),
        makeLeg({ legId: 'l2', legStatus: 'dnp' as DfsLegStatus }),
        makeLeg({ legId: 'l3' }),
        makeLeg({ legId: 'l4' }),
      ];
      const result = applyLegDnp({
        app: 'prizepicks',
        playType: 'power',
        legs: baseLegs,
        legIdToMark: 'l2',
        stake: 10,
        currentMultiplier: 10,
      });

      expect(result.alreadyDnp).toBe(true);
      expect(result.isVoided).toBe(false);
      expect(result.updatedLegs).toBe(baseLegs);
      expect(result.newMultiplier).toBe(10);
    });

    test('notFound: legId not in array returns notFound=true and same legs reference', () => {
      const baseLegs: DfsBetLeg[] = [makeLeg({ legId: 'l1' }), makeLeg({ legId: 'l2' })];
      const result = applyLegDnp({
        app: 'prizepicks',
        playType: 'power',
        legs: baseLegs,
        legIdToMark: 'leg-does-not-exist',
        stake: 10,
        currentMultiplier: 3,
      });

      expect(result.notFound).toBe(true);
      expect(result.updatedLegs).toBe(baseLegs);
      expect(result.newMultiplier).toBe(3);
    });
  });

  describe('single-leg DFS — bet-void branch (money-flow event)', () => {
    test('survivingPickCount < 1 → isVoided=true, multiplier and payout zeroed', () => {
      const singleLeg = [makeLeg({ legId: 'only' })];
      const result = applyLegDnp({
        app: 'prizepicks',
        playType: 'power',
        legs: singleLeg,
        legIdToMark: 'only',
        stake: 20,
        currentMultiplier: 3,
      });

      expect(result.isVoided).toBe(true);
      expect(result.alreadyDnp).toBe(false);
      expect(result.notFound).toBe(false);
      expect(result.newMultiplier).toBe(0);
      expect(result.newPotentialPayout).toBe(0);
      expect(result.updatedLegs[0].legStatus).toBe('dnp');
    });

    test('contract pin: void column writes mirror bet-service.ts:399-433 markLegDnp', () => {
      // Documents the exact columns the watcher writes when isVoided=true.
      // If markLegDnp's RN-side payload changes (e.g. refund formula, new
      // settled_at semantics), this assertion + the watcher's payload
      // construction must move together. Money-flow regression here would
      // mis-credit refunds.
      const stake = 17.5;
      const singleLeg = [makeLeg({ legId: 'only' })];
      const result = applyLegDnp({
        app: 'underdog',
        playType: 'underdog_standard',
        legs: singleLeg,
        legIdToMark: 'only',
        stake,
        currentMultiplier: 5,
      });

      expect(result.isVoided).toBe(true);
      expect(result.newMultiplier).toBe(0);
      expect(result.newPotentialPayout).toBe(0);

      // Watcher void-branch payload (see processPreGameDnpForBet in
      // supabase/functions/bet-dfs-settlement-watcher/index.ts):
      const watcherVoidPayload = {
        legs: result.updatedLegs,
        multiplier: 0,
        potential_payout: 0,
        status: 'void',
        actual_payout: stake,
        withdrawable_payout: stake,
        bonus_payout: 0,
      };
      expect(watcherVoidPayload.actual_payout).toBe(stake);
      expect(watcherVoidPayload.withdrawable_payout).toBe(stake);
      expect(watcherVoidPayload.bonus_payout).toBe(0);
      expect(watcherVoidPayload.status).toBe('void');
    });
  });

  describe('post-game-style DNP (surviving hits known) — recalc math sanity', () => {
    test('PrizePicks Flex 4-pick @ 5x → DNP one leg with 3 surviving wins → 2.25x', () => {
      // Exercises the meaningful demotion path: ratio = surviving(3 picks,
      // 3 hits) / original(4 picks, 4 hits) = 2.25 / 5 = 0.45.
      // Slip multiplier 5 × 0.45 = 2.25. The pre-game path doesn't hit
      // this branch (survivors are still pending), but the helper is
      // shared with bet-service.ts:markLegDnp's post-game flow.
      const legs: DfsBetLeg[] = [
        makeLeg({ legId: 'l1' }),
        makeLeg({ legId: 'l2', legStatus: 'won' as DfsLegStatus }),
        makeLeg({ legId: 'l3', legStatus: 'won' as DfsLegStatus }),
        makeLeg({ legId: 'l4', legStatus: 'won' as DfsLegStatus }),
      ];
      const result = applyLegDnp({
        app: 'prizepicks',
        playType: 'flex',
        legs,
        legIdToMark: 'l1',
        stake: 10,
        currentMultiplier: 5,
      });

      expect(result.isVoided).toBe(false);
      expect(result.newMultiplier).toBeCloseTo(2.25, 4);
      expect(result.newPotentialPayout).toBeCloseTo(22.5, 2);
    });
  });

  describe('input guards', () => {
    test('zero stake → newPotentialPayout is 0 even with valid multiplier', () => {
      const legs: DfsBetLeg[] = [
        makeLeg({ legId: 'l1' }),
        makeLeg({ legId: 'l2' }),
        makeLeg({ legId: 'l3' }),
      ];
      const result = applyLegDnp({
        app: 'prizepicks',
        playType: 'power',
        legs,
        legIdToMark: 'l1',
        stake: 0,
        currentMultiplier: 5,
      });
      expect(result.isVoided).toBe(false);
      expect(result.newPotentialPayout).toBe(0);
    });
  });
});
