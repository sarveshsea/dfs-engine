/**
 * Example: grade a full PrizePicks Power Play.
 *
 * Run: npx tsx examples/grade-entry.ts
 */
import {
  gradeDfsBetFromGraded,
  type DfsBetLeg,
  type DfsLegStatus,
} from '@buzzr/dfs-engine';

// Minimal DfsBetLeg helper — the grader only reads legId + legStatus.
function leg(legId: string, legStatus: DfsLegStatus): DfsBetLeg {
  return {
    legId,
    playerName: 'Player',
    playerTeam: null,
    playerPosition: null,
    playerNumber: null,
    playerAthleteId: null,
    linkage: null,
    propType: 'Points',
    line: 0,
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

// 5-pick PrizePicks Power, all hit. Stake $10 at the 20× multiplier.
const result = gradeDfsBetFromGraded({
  app: 'prizepicks',
  playType: 'power',
  legs: [
    leg('a', 'won'),
    leg('b', 'won'),
    leg('c', 'won'),
    leg('d', 'won'),
    leg('e', 'won'),
  ],
  stake: 10,
  displayedMultiplier: 20,
  baseMultiplier: 20,
  profitBoostPct: null,
});

console.log(result);
// → { status: 'won', effectiveMultiplier: 20, totalPayout: 200,
//     withdrawablePayout: 200, bonusPayout: 0 }

// Same shape but one leg lost: bet status is 'lost', payouts zero.
const oneMiss = gradeDfsBetFromGraded({
  app: 'prizepicks',
  playType: 'power',
  legs: [leg('a', 'won'), leg('b', 'won'), leg('c', 'lost'), leg('d', 'won'), leg('e', 'won')],
  stake: 10,
  displayedMultiplier: 20,
  baseMultiplier: 20,
  profitBoostPct: null,
});
console.log(oneMiss.status); // → 'lost'

// Pending semantics: any pending surviving leg keeps the bet pending,
// even if you call grade every tick.
const stillRunning = gradeDfsBetFromGraded({
  app: 'prizepicks',
  playType: 'power',
  legs: [leg('a', 'won'), leg('b', 'pending'), leg('c', 'won'), leg('d', 'won'), leg('e', 'won')],
  stake: 10,
  displayedMultiplier: 20,
  baseMultiplier: 20,
  profitBoostPct: null,
});
console.log(stillRunning.status); // → 'pending'
