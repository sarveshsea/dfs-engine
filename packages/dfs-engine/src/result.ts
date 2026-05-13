/**
 * Discriminated-union result types for the `*Explained` variants of the
 * grading API. The null-returning originals (extractStatForProp,
 * gradeLegFromActual) stay stable; the Explained variants carry a reason
 * code so callers can distinguish "we don't support this league" from
 * "the player didn't play" from "the slip used a prop name we don't
 * know" without re-deriving from inputs.
 *
 * Reason codes are an additive enum — new failure modes are pushed onto
 * the union, never renamed or repurposed.
 */

export type StatExtractionFailure =
  /** Slip's propType string isn't in DfsPropTypeKey (or its alias table). */
  | { ok: false; reason: 'unknown_prop'; detail: string }
  /** League has no registered adapter table. */
  | { ok: false; reason: 'unsupported_league'; detail: string }
  /** League is supported but its table doesn't carry an adapter for this prop. */
  | { ok: false; reason: 'prop_not_supported_for_league'; detail: string }
  /** Adapter ran but couldn't compute a value (missing gamelog field, gated off, etc.). */
  | { ok: false; reason: 'adapter_returned_null'; detail: string };

export type StatExtractionResult = { ok: true; value: number } | StatExtractionFailure;

export type LegGradingFailure =
  /** `actual` is null — game hasn't ended or watcher hasn't polled yet. */
  | { ok: false; reason: 'pending' }
  /** `actual` is NaN or non-finite — upstream parse problem; caller should not display this leg as graded. */
  | { ok: false; reason: 'unparseable_actual'; detail: string };

export type LegGradingResult = { ok: true; status: 'won' | 'lost' | 'push' } | LegGradingFailure;
