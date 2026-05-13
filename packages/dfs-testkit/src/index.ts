import {
  defineStatProvider,
  type DfsEntryInput,
  type DfsLegInput,
  type PlayerGameLogEntryShape,
  type StatProvider,
} from '@buzzr/dfs-engine';

export function makeGameLogEntry(
  overrides: Partial<PlayerGameLogEntryShape> = {},
): PlayerGameLogEntryShape {
  return {
    date: '2026-05-07T00:00:00.000Z',
    minutes: '34:00',
    points: '24',
    rebounds: '7',
    assists: '5',
    steals: '1',
    blocks: '0',
    turnovers: '2',
    threeP: '3',
    ...overrides,
  };
}

export function makeDfsLeg(overrides: Partial<DfsLegInput> = {}): DfsLegInput {
  return {
    legId: 'leg-1',
    playerName: 'Fixture Player',
    playerId: null,
    league: 'NBA',
    propType: 'Points',
    line: 20.5,
    direction: 'over',
    gameDate: '2026-05-07T00:00:00.000Z',
    ...overrides,
  };
}

export function makeDfsEntry(overrides: Partial<DfsEntryInput> = {}): DfsEntryInput {
  return {
    entryId: 'fixture-entry',
    app: 'prizepicks',
    playType: 'power',
    stake: 10,
    displayedMultiplier: 3,
    legs: [makeDfsLeg()],
    ...overrides,
  };
}

export function createMockStatProvider(
  rowsByLegId: Record<string, PlayerGameLogEntryShape[]>,
  id = 'mock-stat-provider',
): StatProvider {
  return defineStatProvider({
    id,
    getGameLog({ leg }) {
      return rowsByLegId[leg.legId] ?? [];
    },
  });
}
