/**
 * Benchmarks for the hot paths. Run: `npm run bench`
 *
 * Numbers in the README come from this file. Re-run after any change
 * that touches grading or stat extraction.
 */
import { bench, describe } from 'vitest';
import {
  extractStatForPropViaRegistry,
  gradeLegFromActual,
  gradeDfsBetFromGraded,
  applyLegDnp,
  recalcMultiplierAfterDnp,
  type DfsBetLeg,
  type DfsLegStatus,
} from '../src';

const NBA_ENTRY = {
  date: '2026-05-04',
  minutes: '38:21',
  points: '28',
  rebounds: '4',
  assists: '7',
  steals: '1',
  blocks: '0',
  turnovers: '2',
  threeP: '3-7',
};

function leg(legId: string, legStatus: DfsLegStatus): DfsBetLeg {
  return {
    legId,
    playerName: 'P',
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

const FIVE_PICK_ALL_HIT = [
  leg('a', 'won'),
  leg('b', 'won'),
  leg('c', 'won'),
  leg('d', 'won'),
  leg('e', 'won'),
];

describe('gradeLegFromActual', () => {
  bench('won', () => {
    gradeLegFromActual(24.5, 'over', 28);
  });

  bench('lost', () => {
    gradeLegFromActual(24.5, 'over', 20);
  });

  bench('pending (null)', () => {
    gradeLegFromActual(24.5, 'over', null);
  });

  bench('pending (NaN)', () => {
    gradeLegFromActual(24.5, 'over', NaN);
  });
});

describe('extractStatForPropViaRegistry', () => {
  bench('NBA Points (canonical key)', () => {
    extractStatForPropViaRegistry('Points', 'NBA', NBA_ENTRY, 'prizepicks');
  });

  bench('NBA Pts+Rebs+Asts (combo)', () => {
    extractStatForPropViaRegistry('Pts+Rebs+Asts', 'NBA', NBA_ENTRY, 'prizepicks');
  });

  bench('NBA Triple-Double (binary computation)', () => {
    extractStatForPropViaRegistry('Triple-Double', 'NBA', NBA_ENTRY, 'prizepicks');
  });

  bench('alias resolution: "3ptm" → 3-Pointers Made', () => {
    extractStatForPropViaRegistry('3ptm', 'NBA', NBA_ENTRY, 'prizepicks');
  });

  bench('unknown prop (full miss)', () => {
    extractStatForPropViaRegistry('Quantum Steals', 'NBA', NBA_ENTRY, 'prizepicks');
  });

  bench('unknown league (full miss)', () => {
    extractStatForPropViaRegistry('Points', 'CRICKET', NBA_ENTRY, 'prizepicks');
  });
});

describe('gradeDfsBetFromGraded', () => {
  bench('5-pick Power, all hit', () => {
    gradeDfsBetFromGraded({
      app: 'prizepicks',
      playType: 'power',
      legs: FIVE_PICK_ALL_HIT,
      stake: 10,
      displayedMultiplier: 20,
      baseMultiplier: 20,
      profitBoostPct: null,
    });
  });

  bench('6-pick Flex, 5-of-6 hit', () => {
    gradeDfsBetFromGraded({
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
  });
});

describe('payout math', () => {
  bench('applyLegDnp on 6-pick', () => {
    applyLegDnp({
      app: 'prizepicks',
      playType: 'power',
      legs: [...FIVE_PICK_ALL_HIT, leg('f', 'pending')],
      legIdToMark: 'f',
      stake: 10,
      currentMultiplier: 37.5,
    });
  });

  bench('recalcMultiplierAfterDnp', () => {
    recalcMultiplierAfterDnp({
      app: 'prizepicks',
      playType: 'power',
      originalPickCount: 6,
      survivingPickCount: 5,
      survivingHits: 5,
      originalMultiplier: 37.5,
    });
  });
});
