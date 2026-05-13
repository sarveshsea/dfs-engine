/**
 * Tests for detectMidGameDnp — the pure decision function the live
 * watcher (Phase E.mid) calls per basketball leg per tick.
 *
 * Coverage matrix:
 *   - The four-state decision contract (hard-flag / soft-flag / clear /
 *     no-action) at the boundaries (Q1 zero, Q2 zero, Q3 zero, Q4 zero,
 *     Q4 four-min, Q4 five-min, OT).
 *   - The minutesString parser across the four shapes ESPN emits
 *     ("MM:SS", bare integer, "DNP", "-").
 *   - Game-state gating: pre / post never flag, even if MIN is zero.
 *   - Period null defaults to no-action (we only flag when ESPN
 *     surfaces a parseable quarter).
 */
import { detectMidGameDnp, reconcileMidGameDnpEntries } from '../src/grading';
import type { DfsBetPendingVerification, DfsMidGameDnpEntry } from '../src/types';

describe('detectMidGameDnp — game-state gate', () => {
  test('gameState="pre" returns no-action regardless of minutes/period', () => {
    expect(detectMidGameDnp({ minutesString: '0', gameState: 'pre', period: 1 })).toBe('no-action');
    expect(detectMidGameDnp({ minutesString: '0:00', gameState: 'pre', period: null })).toBe(
      'no-action',
    );
  });

  test('gameState="post" returns no-action (Phase C grades from gamelog after final)', () => {
    expect(detectMidGameDnp({ minutesString: '0', gameState: 'post', period: 4 })).toBe(
      'no-action',
    );
    expect(detectMidGameDnp({ minutesString: '23:14', gameState: 'post', period: 4 })).toBe(
      'no-action',
    );
  });
});

describe('detectMidGameDnp — period gating', () => {
  test('Q1 zero minutes is no-action (early sub-rotation noise)', () => {
    expect(detectMidGameDnp({ minutesString: '0', gameState: 'in', period: 1 })).toBe('no-action');
    expect(detectMidGameDnp({ minutesString: '0:00', gameState: 'in', period: 1 })).toBe(
      'no-action',
    );
  });

  test('Q2 zero minutes → hard-flag', () => {
    expect(detectMidGameDnp({ minutesString: '0', gameState: 'in', period: 2 })).toBe('hard-flag');
  });

  test('Q3 zero minutes → hard-flag', () => {
    expect(detectMidGameDnp({ minutesString: '0', gameState: 'in', period: 3 })).toBe('hard-flag');
  });

  test('Q4 zero minutes → hard-flag (zero takes precedence over soft)', () => {
    expect(detectMidGameDnp({ minutesString: '0', gameState: 'in', period: 4 })).toBe('hard-flag');
  });

  test('OT zero minutes → hard-flag', () => {
    expect(detectMidGameDnp({ minutesString: '0', gameState: 'in', period: 5 })).toBe('hard-flag');
  });

  test('period=null returns no-action (no quarter signal from ESPN)', () => {
    expect(detectMidGameDnp({ minutesString: '0', gameState: 'in', period: null })).toBe(
      'no-action',
    );
  });
});

describe('detectMidGameDnp — soft-flag boundary', () => {
  test('Q4 with 4 minutes played → soft-flag', () => {
    expect(detectMidGameDnp({ minutesString: '4:32', gameState: 'in', period: 4 })).toBe(
      'soft-flag',
    );
  });

  test('Q4 with 1 minute played → soft-flag (still under the 5-min floor)', () => {
    expect(detectMidGameDnp({ minutesString: '1:14', gameState: 'in', period: 4 })).toBe(
      'soft-flag',
    );
  });

  test('Q3 with 4 minutes played → no-action (soft only fires in Q4+)', () => {
    expect(detectMidGameDnp({ minutesString: '4:32', gameState: 'in', period: 3 })).toBe(
      'no-action',
    );
  });

  test('Q4 with exactly 5 minutes → clear (the threshold flips both flags off)', () => {
    expect(detectMidGameDnp({ minutesString: '5:00', gameState: 'in', period: 4 })).toBe('clear');
  });
});

describe('detectMidGameDnp — clear at any time', () => {
  test('Q1 with 6 minutes → clear', () => {
    expect(detectMidGameDnp({ minutesString: '6:14', gameState: 'in', period: 1 })).toBe('clear');
  });

  test('Q3 with 18 minutes → clear', () => {
    expect(detectMidGameDnp({ minutesString: '18:42', gameState: 'in', period: 3 })).toBe('clear');
  });

  test('clear fires even when period is null (we have a real MIN signal)', () => {
    expect(detectMidGameDnp({ minutesString: '14:00', gameState: 'in', period: null })).toBe(
      'clear',
    );
  });
});

describe('detectMidGameDnp — minutesString parser', () => {
  test('"MM:SS" truncates to coarse minutes', () => {
    // 4 minutes 59 seconds is still under the 5-minute floor.
    expect(detectMidGameDnp({ minutesString: '4:59', gameState: 'in', period: 4 })).toBe(
      'soft-flag',
    );
    // 5:01 → 5 minutes → clear.
    expect(detectMidGameDnp({ minutesString: '5:01', gameState: 'in', period: 4 })).toBe('clear');
  });

  test('bare integer minutes works', () => {
    expect(detectMidGameDnp({ minutesString: '0', gameState: 'in', period: 2 })).toBe('hard-flag');
    expect(detectMidGameDnp({ minutesString: '7', gameState: 'in', period: 2 })).toBe('clear');
  });

  test('"DNP" string is signal-less → no-action', () => {
    // ESPN emits "DNP" for inactive players. We don't auto-flag; the
    // user verifies. (Phase C handles inactive list separately.)
    expect(detectMidGameDnp({ minutesString: 'DNP', gameState: 'in', period: 3 })).toBe(
      'no-action',
    );
    expect(detectMidGameDnp({ minutesString: 'dnp', gameState: 'in', period: 3 })).toBe(
      'no-action',
    );
  });

  test('empty / dash variants are signal-less', () => {
    for (const raw of ['', ' ', '-', '—']) {
      expect(detectMidGameDnp({ minutesString: raw, gameState: 'in', period: 3 })).toBe(
        'no-action',
      );
    }
  });

  test('garbage strings fall through to no-action (defensive)', () => {
    expect(detectMidGameDnp({ minutesString: 'foo', gameState: 'in', period: 3 })).toBe(
      'no-action',
    );
    expect(detectMidGameDnp({ minutesString: ':30', gameState: 'in', period: 3 })).toBe(
      'no-action',
    );
  });
});

/* ────────────────────────────────────────────────────────────────────
 * reconcileMidGameDnpEntries — write-side state machine
 * ────────────────────────────────────────────────────────────────── */

const NOW = '2026-05-04T20:30:00.000Z';
const EARLIER = '2026-05-04T20:00:00.000Z';

function makeExisting(entries: DfsMidGameDnpEntry[]): DfsBetPendingVerification {
  return { midGameDnp: entries, lastFlaggedAt: EARLIER };
}

describe('reconcileMidGameDnpEntries — fresh flags', () => {
  test('hard-flag with no existing entry → push new hard entry', () => {
    const r = reconcileMidGameDnpEntries({
      existing: null,
      perLegDecisions: [{ legId: 'leg-1', decision: 'hard-flag' }],
      nowIso: NOW,
    });
    expect(r.changed).toBe(true);
    expect(r.next).toEqual({
      midGameDnp: [{ legId: 'leg-1', severity: 'hard', flaggedAt: NOW, dismissedAt: null }],
      lastFlaggedAt: NOW,
    });
  });

  test('soft-flag with no existing entry → push new soft entry', () => {
    const r = reconcileMidGameDnpEntries({
      existing: null,
      perLegDecisions: [{ legId: 'leg-1', decision: 'soft-flag' }],
      nowIso: NOW,
    });
    expect(r.changed).toBe(true);
    expect(r.next?.midGameDnp[0]).toMatchObject({ severity: 'soft', dismissedAt: null });
  });

  test('no-action with no existing entry → unchanged (existing stays null)', () => {
    const r = reconcileMidGameDnpEntries({
      existing: null,
      perLegDecisions: [{ legId: 'leg-1', decision: 'no-action' }],
      nowIso: NOW,
    });
    expect(r.changed).toBe(false);
    expect(r.next).toBeNull();
  });

  test('clear with no existing entry → no-op', () => {
    const r = reconcileMidGameDnpEntries({
      existing: null,
      perLegDecisions: [{ legId: 'leg-1', decision: 'clear' }],
      nowIso: NOW,
    });
    expect(r.changed).toBe(false);
    expect(r.next).toBeNull();
  });
});

describe('reconcileMidGameDnpEntries — dedupe and idempotency', () => {
  test('hard-flag on already-hard entry → no-op (idempotent re-runs)', () => {
    const existing = makeExisting([
      { legId: 'leg-1', severity: 'hard', flaggedAt: EARLIER, dismissedAt: null },
    ]);
    const r = reconcileMidGameDnpEntries({
      existing,
      perLegDecisions: [{ legId: 'leg-1', decision: 'hard-flag' }],
      nowIso: NOW,
    });
    expect(r.changed).toBe(false);
    expect(r.next?.midGameDnp[0].flaggedAt).toBe(EARLIER);
  });

  test('soft-flag on already-soft entry → no-op (no flaggedAt churn)', () => {
    const existing = makeExisting([
      { legId: 'leg-1', severity: 'soft', flaggedAt: EARLIER, dismissedAt: null },
    ]);
    const r = reconcileMidGameDnpEntries({
      existing,
      perLegDecisions: [{ legId: 'leg-1', decision: 'soft-flag' }],
      nowIso: NOW,
    });
    expect(r.changed).toBe(false);
  });

  test('soft-flag on existing hard entry → no-op (do not downgrade)', () => {
    const existing = makeExisting([
      { legId: 'leg-1', severity: 'hard', flaggedAt: EARLIER, dismissedAt: null },
    ]);
    const r = reconcileMidGameDnpEntries({
      existing,
      perLegDecisions: [{ legId: 'leg-1', decision: 'soft-flag' }],
      nowIso: NOW,
    });
    expect(r.changed).toBe(false);
    expect(r.next?.midGameDnp[0].severity).toBe('hard');
  });
});

describe('reconcileMidGameDnpEntries — soft → hard escalation', () => {
  test('escalates severity, refreshes flaggedAt, clears dismissedAt', () => {
    const existing = makeExisting([
      { legId: 'leg-1', severity: 'soft', flaggedAt: EARLIER, dismissedAt: EARLIER },
    ]);
    const r = reconcileMidGameDnpEntries({
      existing,
      perLegDecisions: [{ legId: 'leg-1', decision: 'hard-flag' }],
      nowIso: NOW,
    });
    expect(r.changed).toBe(true);
    expect(r.next?.midGameDnp[0]).toEqual({
      legId: 'leg-1',
      severity: 'hard',
      flaggedAt: NOW,
      dismissedAt: null,
    });
  });

  test('escalates even when soft was undismissed (situation got worse, re-render)', () => {
    const existing = makeExisting([
      { legId: 'leg-1', severity: 'soft', flaggedAt: EARLIER, dismissedAt: null },
    ]);
    const r = reconcileMidGameDnpEntries({
      existing,
      perLegDecisions: [{ legId: 'leg-1', decision: 'hard-flag' }],
      nowIso: NOW,
    });
    expect(r.changed).toBe(true);
    expect(r.next?.midGameDnp[0].severity).toBe('hard');
    expect(r.next?.midGameDnp[0].flaggedAt).toBe(NOW);
  });
});

describe('reconcileMidGameDnpEntries — clear', () => {
  test('clear removes the entry', () => {
    const existing = makeExisting([
      { legId: 'leg-1', severity: 'hard', flaggedAt: EARLIER, dismissedAt: null },
    ]);
    const r = reconcileMidGameDnpEntries({
      existing,
      perLegDecisions: [{ legId: 'leg-1', decision: 'clear' }],
      nowIso: NOW,
    });
    expect(r.changed).toBe(true);
    expect(r.next?.midGameDnp).toEqual([]);
    expect(r.next?.lastFlaggedAt).toBe(NOW);
  });

  test('clear preserves other entries that didnt change', () => {
    const existing = makeExisting([
      { legId: 'leg-1', severity: 'hard', flaggedAt: EARLIER, dismissedAt: null },
      { legId: 'leg-2', severity: 'soft', flaggedAt: EARLIER, dismissedAt: null },
    ]);
    const r = reconcileMidGameDnpEntries({
      existing,
      perLegDecisions: [
        { legId: 'leg-1', decision: 'clear' },
        { legId: 'leg-2', decision: 'no-action' },
      ],
      nowIso: NOW,
    });
    expect(r.changed).toBe(true);
    expect(r.next?.midGameDnp.map((e) => e.legId)).toEqual(['leg-2']);
  });
});

describe('reconcileMidGameDnpEntries — stale entries', () => {
  test('legs the watcher didnt process this tick are preserved verbatim', () => {
    // Game finished between ticks; the leg falls out of the
    // game_status='in_progress' filter. The verify card filters dead
    // entries at render time on legStatus; the reconciler's job is
    // only to operate on what the watcher saw.
    const existing = makeExisting([
      { legId: 'leg-finished', severity: 'hard', flaggedAt: EARLIER, dismissedAt: null },
    ]);
    const r = reconcileMidGameDnpEntries({
      existing,
      perLegDecisions: [],
      nowIso: NOW,
    });
    expect(r.changed).toBe(false);
    expect(r.next?.midGameDnp).toEqual(existing.midGameDnp);
  });

  test('preserves dismissedAt on entries with hard-flag dedupe', () => {
    const existing = makeExisting([
      { legId: 'leg-1', severity: 'hard', flaggedAt: EARLIER, dismissedAt: EARLIER },
    ]);
    const r = reconcileMidGameDnpEntries({
      existing,
      perLegDecisions: [{ legId: 'leg-1', decision: 'hard-flag' }],
      nowIso: NOW,
    });
    expect(r.changed).toBe(false);
    expect(r.next?.midGameDnp[0].dismissedAt).toBe(EARLIER);
  });
});

describe('reconcileMidGameDnpEntries — multi-leg ticks', () => {
  test('mix of new flags, escalations, and clears in one tick', () => {
    const existing = makeExisting([
      { legId: 'leg-soft', severity: 'soft', flaggedAt: EARLIER, dismissedAt: null },
      { legId: 'leg-cleared', severity: 'hard', flaggedAt: EARLIER, dismissedAt: null },
    ]);
    const r = reconcileMidGameDnpEntries({
      existing,
      perLegDecisions: [
        { legId: 'leg-soft', decision: 'hard-flag' }, // escalate
        { legId: 'leg-cleared', decision: 'clear' }, // remove
        { legId: 'leg-new', decision: 'hard-flag' }, // add
      ],
      nowIso: NOW,
    });
    expect(r.changed).toBe(true);
    const byLeg = new Map(r.next!.midGameDnp.map((e) => [e.legId, e]));
    expect(byLeg.has('leg-cleared')).toBe(false);
    expect(byLeg.get('leg-soft')?.severity).toBe('hard');
    expect(byLeg.get('leg-new')?.severity).toBe('hard');
  });
});
