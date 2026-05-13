import {
  defineStatProvider,
  type DfsEntryInput,
  type DfsLegInput,
  type PlayerGameLogEntryShape,
  type StatProvider,
} from '@buzzr/dfs-engine';

export type EspnGameLogLoaderInput = {
  playerId: string | null;
  playerName: string;
  league: string;
  gameId: string | null;
  gameDate: string | null;
  leg: DfsLegInput;
  entry: DfsEntryInput;
  context: Record<string, unknown>;
};

export type EspnStatProviderOptions = {
  id?: string;
  getGameLog: (
    input: EspnGameLogLoaderInput,
  ) => PlayerGameLogEntryShape[] | Promise<PlayerGameLogEntryShape[]>;
};

export function createEspnStatProvider(options: EspnStatProviderOptions): StatProvider {
  return defineStatProvider({
    id: options.id ?? 'espn',
    async getGameLog({ leg, entry, context }) {
      return options.getGameLog({
        playerId: leg.playerId ?? null,
        playerName: leg.playerName,
        league: leg.league,
        gameId: leg.gameId ?? null,
        gameDate: leg.gameDate ?? null,
        leg,
        entry,
        context: context.metadata ?? {},
      });
    },
  });
}
