/**
 * Runtime validators for the package's public input shapes.
 *
 * Use these at system boundaries — incoming JSON from a slip parser, a
 * webhook payload, an LLM response. Inside trusted code paths the
 * TypeScript types are enough; validators are for "I don't trust this
 * source" entrypoints.
 *
 * Zero runtime deps (no zod) — handwritten checks tuned for the well-
 * known shapes. Returns a discriminated union with field-level errors
 * so callers can surface useful messages instead of "expected object".
 */
import type { DfsBetLeg, DfsLegStatus, DfsBoostType } from './types';
import type { PlayerGameLogEntryShape } from './grading';

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/**
 * Validate that a value conforms to PlayerGameLogEntryShape. Required
 * fields: date, minutes, points, rebounds, assists, steals, blocks,
 * turnovers, threeP — all strings (the engine treats `""` and `"-"` as
 * "no data", but the field must be present).
 */
export function validatePlayerGameLogEntryShape(
  entry: unknown,
): ValidationResult<PlayerGameLogEntryShape> {
  const errors: string[] = [];
  if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
    return { ok: false, errors: ['expected object, got ' + describe(entry)] };
  }
  const e = entry as Record<string, unknown>;

  for (const key of REQUIRED_GAMELOG_FIELDS) {
    if (typeof e[key] !== 'string') {
      errors.push(`field "${key}": expected string, got ${describe(e[key])}`);
    }
  }

  // Optional fields — if present, must be the right type.
  if ('mlbRole' in e && e.mlbRole != null && !['batter', 'pitcher'].includes(e.mlbRole as string)) {
    errors.push(
      `field "mlbRole": expected 'batter' | 'pitcher' | null, got ${describe(e.mlbRole)}`,
    );
  }
  if (
    'nhlPosition' in e &&
    e.nhlPosition != null &&
    !['skater', 'goalie'].includes(e.nhlPosition as string)
  ) {
    errors.push(
      `field "nhlPosition": expected 'skater' | 'goalie' | null, got ${describe(e.nhlPosition)}`,
    );
  }
  if (
    'mlbExtras' in e &&
    e.mlbExtras != null &&
    (typeof e.mlbExtras !== 'object' || Array.isArray(e.mlbExtras))
  ) {
    errors.push(`field "mlbExtras": expected object or undefined, got ${describe(e.mlbExtras)}`);
  }
  if (
    'categories' in e &&
    e.categories != null &&
    (typeof e.categories !== 'object' || Array.isArray(e.categories))
  ) {
    errors.push(`field "categories": expected object or undefined, got ${describe(e.categories)}`);
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: entry as PlayerGameLogEntryShape };
}

/**
 * Validate that a value conforms to DfsBetLeg. The grader only reads
 * `legId` and `legStatus`, so this is the minimum-viable validation —
 * structurally complete legs may carry many more fields than checked here.
 */
export function validateDfsBetLeg(leg: unknown): ValidationResult<DfsBetLeg> {
  const errors: string[] = [];
  if (leg == null || typeof leg !== 'object' || Array.isArray(leg)) {
    return { ok: false, errors: ['expected object, got ' + describe(leg)] };
  }
  const l = leg as Record<string, unknown>;

  if (typeof l.legId !== 'string' || l.legId.length === 0) {
    errors.push(`field "legId": expected non-empty string, got ${describe(l.legId)}`);
  }
  if (!isLegStatus(l.legStatus)) {
    errors.push(
      `field "legStatus": expected 'pending' | 'won' | 'lost' | 'push' | 'dnp', got ${describe(l.legStatus)}`,
    );
  }
  if (typeof l.playerName !== 'string') {
    errors.push(`field "playerName": expected string, got ${describe(l.playerName)}`);
  }
  if (typeof l.propType !== 'string') {
    errors.push(`field "propType": expected string, got ${describe(l.propType)}`);
  }
  if (typeof l.line !== 'number' || !Number.isFinite(l.line)) {
    errors.push(`field "line": expected finite number, got ${describe(l.line)}`);
  }
  if (l.direction !== 'over' && l.direction !== 'under') {
    errors.push(`field "direction": expected 'over' | 'under', got ${describe(l.direction)}`);
  }
  if (typeof l.league !== 'string' || l.league.length === 0) {
    errors.push(`field "league": expected non-empty string, got ${describe(l.league)}`);
  }
  if (!isBoostType(l.boostType)) {
    errors.push(
      `field "boostType": expected 'standard' | 'demon' | 'goblin', got ${describe(l.boostType)}`,
    );
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: leg as DfsBetLeg };
}

const REQUIRED_GAMELOG_FIELDS = [
  'date',
  'minutes',
  'points',
  'rebounds',
  'assists',
  'steals',
  'blocks',
  'turnovers',
  'threeP',
] as const;

const LEG_STATUSES: readonly DfsLegStatus[] = ['pending', 'won', 'lost', 'push', 'dnp'];
const BOOST_TYPES: readonly DfsBoostType[] = ['standard', 'demon', 'goblin'];

function isLegStatus(v: unknown): v is DfsLegStatus {
  return typeof v === 'string' && (LEG_STATUSES as readonly string[]).includes(v);
}

function isBoostType(v: unknown): v is DfsBoostType {
  return typeof v === 'string' && (BOOST_TYPES as readonly string[]).includes(v);
}

function describe(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (Array.isArray(v)) return `array(length=${v.length})`;
  return typeof v;
}
