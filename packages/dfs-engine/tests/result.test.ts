/**
 * Tests for the typed Result variants — extractStatForPropExplained and
 * gradeLegFromActualExplained — plus the NaN/Infinity bug fix in the
 * legacy gradeLegFromActual.
 */
import {
  extractStatForPropExplained,
  gradeLegFromActual,
  gradeLegFromActualExplained,
  registerLeague,
  unregisterLeague,
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
  threeP: '3',
};

describe('extractStatForPropExplained', () => {
  test('ok path returns value + ok=true', () => {
    expect(extractStatForPropExplained('Points', 'NBA', NBA_ENTRY, 'prizepicks')).toEqual({
      ok: true,
      value: 28,
    });
  });

  test('unknown prop returns ok=false reason=unknown_prop', () => {
    const result = extractStatForPropExplained('Nonsense Stat', 'NBA', NBA_ENTRY, 'prizepicks');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unknown_prop');
      expect(result.detail).toContain('Nonsense Stat');
    }
  });

  test('unsupported league returns ok=false reason=unsupported_league', () => {
    const result = extractStatForPropExplained('Points', 'CRICKET', NBA_ENTRY, 'prizepicks');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unsupported_league');
      expect(result.detail).toContain('CRICKET');
    }
  });

  test('prop not supported for league returns prop_not_supported_for_league', () => {
    // Register a soccer league that only has 'Goals'. Then ask for 'Points'
    // which is canonical but not in the soccer table.
    registerLeague('SOCCER_TEST', { Goals: () => 1 });
    const result = extractStatForPropExplained('Points', 'SOCCER_TEST', NBA_ENTRY, 'prizepicks');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('prop_not_supported_for_league');
      expect(result.detail).toContain('Points');
      expect(result.detail).toContain('SOCCER_TEST');
    }
    unregisterLeague('SOCCER_TEST');
  });

  test('adapter returning null surfaces as adapter_returned_null', () => {
    // Empty-string fields trigger adapter null returns
    const emptyEntry = { ...NBA_ENTRY, points: '' };
    const result = extractStatForPropExplained('Points', 'NBA', emptyEntry, 'prizepicks');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('adapter_returned_null');
    }
  });
});

describe('gradeLegFromActual — NaN/Infinity bug fix', () => {
  test('NaN actual returns pending (was lost in v0.0.1)', () => {
    expect(gradeLegFromActual(24.5, 'over', NaN)).toBe('pending');
    expect(gradeLegFromActual(24.5, 'under', NaN)).toBe('pending');
  });

  test('Infinity actual returns pending', () => {
    expect(gradeLegFromActual(24.5, 'over', Infinity)).toBe('pending');
    expect(gradeLegFromActual(24.5, 'over', -Infinity)).toBe('pending');
  });

  test('finite actuals still grade correctly (regression guard)', () => {
    expect(gradeLegFromActual(24.5, 'over', 28)).toBe('won');
    expect(gradeLegFromActual(24.5, 'over', 20)).toBe('lost');
    expect(gradeLegFromActual(24, 'over', 24)).toBe('push');
    expect(gradeLegFromActual(24.5, 'over', null)).toBe('pending');
  });
});

describe('gradeLegFromActualExplained', () => {
  test('clean won', () => {
    expect(gradeLegFromActualExplained(24.5, 'over', 28)).toEqual({
      ok: true,
      status: 'won',
    });
  });

  test('clean lost', () => {
    expect(gradeLegFromActualExplained(24.5, 'over', 20)).toEqual({
      ok: true,
      status: 'lost',
    });
  });

  test('push on equality', () => {
    expect(gradeLegFromActualExplained(24, 'over', 24)).toEqual({
      ok: true,
      status: 'push',
    });
  });

  test('null actual → pending', () => {
    expect(gradeLegFromActualExplained(24.5, 'over', null)).toEqual({
      ok: false,
      reason: 'pending',
    });
  });

  test('NaN → unparseable_actual', () => {
    const result = gradeLegFromActualExplained(24.5, 'over', NaN);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unparseable_actual');
      expect(result.detail).toContain('NaN');
    }
  });

  test('Infinity → unparseable_actual', () => {
    const result = gradeLegFromActualExplained(24.5, 'over', Infinity);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unparseable_actual');
    }
  });

  test('under direction flips the comparison correctly', () => {
    expect(gradeLegFromActualExplained(24.5, 'under', 20)).toEqual({
      ok: true,
      status: 'won',
    });
    expect(gradeLegFromActualExplained(24.5, 'under', 28)).toEqual({
      ok: true,
      status: 'lost',
    });
  });
});
