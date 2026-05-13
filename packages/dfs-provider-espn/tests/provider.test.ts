import { describe, expect, test } from 'vitest';
import { createDfsEngine, type PlayerGameLogEntryShape } from '@buzzr/dfs-engine';
import { createEspnStatProvider } from '../src';

const entry: PlayerGameLogEntryShape = {
  date: '2026-05-07T00:00:00.000Z',
  minutes: '36:00',
  points: '29',
  rebounds: '5',
  assists: '7',
  steals: '1',
  blocks: '0',
  turnovers: '3',
  threeP: '4',
};

describe('@buzzr/dfs-provider-espn', () => {
  test('wraps a caller-supplied ESPN loader as a stat provider without doing network I/O itself', async () => {
    const provider = createEspnStatProvider({
      getGameLog: async ({ playerId, league, gameDate }) => {
        expect(playerId).toBe('athlete-1');
        expect(league).toBe('NBA');
        expect(gameDate).toBe('2026-05-07T00:00:00.000Z');
        return [entry];
      },
    });
    const engine = createDfsEngine({ statProviders: [provider] });

    const result = await engine.extractLegStat(
      {
        legId: 'leg-1',
        playerName: 'A. Example',
        playerId: 'athlete-1',
        league: 'NBA',
        propType: 'Points',
        line: 24.5,
        direction: 'over',
        gameDate: '2026-05-07T00:00:00.000Z',
      },
      {
        app: 'prizepicks',
        playType: 'power',
        stake: 10,
        displayedMultiplier: 3,
        legs: [],
      },
      { statProviderId: 'espn' },
    );

    expect(result).toMatchObject({
      ok: true,
      value: 29,
      provenance: { source: 'stat-provider', providerId: 'espn' },
    });
  });
});
