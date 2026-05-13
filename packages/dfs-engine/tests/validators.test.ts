/**
 * Tests for the v0.3 runtime validators.
 */
import { validatePlayerGameLogEntryShape, validateDfsBetLeg } from '../src/validators';

const VALID_ENTRY = {
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

const VALID_LEG = {
  legId: 'a1b2',
  playerName: 'Player Name',
  propType: 'Points',
  line: 24.5,
  direction: 'over' as const,
  league: 'NBA',
  legStatus: 'won' as const,
  boostType: 'standard' as const,
};

describe('validatePlayerGameLogEntryShape', () => {
  test('valid entry passes', () => {
    const result = validatePlayerGameLogEntryShape(VALID_ENTRY);
    expect(result.ok).toBe(true);
  });

  test('null returns ok=false with single error', () => {
    const result = validatePlayerGameLogEntryShape(null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('expected object');
    }
  });

  test('array returns ok=false', () => {
    const result = validatePlayerGameLogEntryShape([]);
    expect(result.ok).toBe(false);
  });

  test('missing required field reports it by name', () => {
    const { points, ...rest } = VALID_ENTRY;
    void points;
    const result = validatePlayerGameLogEntryShape(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('"points"'))).toBe(true);
    }
  });

  test('wrong type for required field reports it', () => {
    const result = validatePlayerGameLogEntryShape({ ...VALID_ENTRY, points: 28 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('"points"') && e.includes('number'))).toBe(true);
    }
  });

  test('reports all bad fields, not just first', () => {
    const broken = { ...VALID_ENTRY, points: null, rebounds: 5 };
    const result = validatePlayerGameLogEntryShape(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    }
  });

  test('valid optional mlbRole accepted', () => {
    const result = validatePlayerGameLogEntryShape({ ...VALID_ENTRY, mlbRole: 'batter' });
    expect(result.ok).toBe(true);
  });

  test('invalid mlbRole reported', () => {
    const result = validatePlayerGameLogEntryShape({
      ...VALID_ENTRY,
      mlbRole: 'designated_hitter',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('mlbRole'))).toBe(true);
    }
  });

  test('invalid nhlPosition reported', () => {
    const result = validatePlayerGameLogEntryShape({ ...VALID_ENTRY, nhlPosition: 'forward' });
    expect(result.ok).toBe(false);
  });
});

describe('validateDfsBetLeg', () => {
  test('valid leg passes', () => {
    const result = validateDfsBetLeg(VALID_LEG);
    expect(result.ok).toBe(true);
  });

  test('missing legId reports it', () => {
    const { legId, ...rest } = VALID_LEG;
    void legId;
    const result = validateDfsBetLeg(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('legId'))).toBe(true);
    }
  });

  test('empty legId reported as non-empty-string', () => {
    const result = validateDfsBetLeg({ ...VALID_LEG, legId: '' });
    expect(result.ok).toBe(false);
  });

  test('bad legStatus enum value reported with allowed list', () => {
    const result = validateDfsBetLeg({ ...VALID_LEG, legStatus: 'cancelled' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('legStatus') && e.includes('pending'))).toBe(
        true,
      );
    }
  });

  test('non-finite line reported', () => {
    const result = validateDfsBetLeg({ ...VALID_LEG, line: Infinity });
    expect(result.ok).toBe(false);
  });

  test('invalid direction reported', () => {
    const result = validateDfsBetLeg({ ...VALID_LEG, direction: 'middle' });
    expect(result.ok).toBe(false);
  });

  test('boostType "demon" / "goblin" / "standard" accepted', () => {
    expect(validateDfsBetLeg({ ...VALID_LEG, boostType: 'demon' }).ok).toBe(true);
    expect(validateDfsBetLeg({ ...VALID_LEG, boostType: 'goblin' }).ok).toBe(true);
    expect(validateDfsBetLeg({ ...VALID_LEG, boostType: 'standard' }).ok).toBe(true);
  });

  test('invalid boostType reported', () => {
    const result = validateDfsBetLeg({ ...VALID_LEG, boostType: 'super_demon' });
    expect(result.ok).toBe(false);
  });
});
