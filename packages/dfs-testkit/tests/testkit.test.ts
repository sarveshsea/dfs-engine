import { describe, expect, test } from 'vitest';
import { createDfsEngine } from '@buzzr/dfs-engine';
import { createMockStatProvider, makeDfsEntry, makeDfsLeg, makeGameLogEntry } from '../src';

describe('@buzzr/dfs-testkit', () => {
  test('builds golden-style entries and mock stat providers for settlement tests', async () => {
    const provider = createMockStatProvider({
      'leg-1': [makeGameLogEntry({ points: '28' })],
    });
    const engine = createDfsEngine({ statProviders: [provider] });

    const result = await engine.settleEntry(
      makeDfsEntry({
        legs: [makeDfsLeg({ legId: 'leg-1', playerId: 'athlete-1', line: 24.5 })],
      }),
      { statProviderId: provider.id },
    );

    expect(result.status).toBe('won');
    expect(result.legs[0]?.actual).toBe(28);
  });
});
