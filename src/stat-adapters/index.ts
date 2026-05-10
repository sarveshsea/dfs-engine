/**
 * DFS stat-adapter registry.
 *
 * Per-league dispatch lives in a Map-backed registry. Built-in sports
 * (NBA/WNBA/NCAAM/NCAAW, NFL, MLB, NHL) auto-register on module import.
 * Callers can add new sports without forking via `registerLeague(...)`.
 *
 * `extractStatForPropViaRegistry` is the thin dispatcher used by the
 * grader: normalize the raw propType string, look up the league's
 * adapter table from the registry, run it against the gamelog entry,
 * return the numeric value or null.
 */
import type { DfsPropTypeKey } from '../prop-normalizer';
import { asDfsPropTypeKey } from '../prop-normalizer';
import type { PlayerGameLogEntryShape } from '../grading';
import type { StatExtractionResult } from '../result';
import type { DfsApp } from '../types';
import { BASKETBALL_ADAPTERS } from './basketball';
import { NFL_ADAPTERS } from './nfl';
import { MLB_ADAPTERS } from './mlb';
import { NHL_ADAPTERS } from './nhl';
import { SOCCER_ADAPTERS } from './soccer';

/**
 * Per-call options threaded through to every adapter. Most adapters
 * ignore this; specific ones (currently only MLB Hitter FS / Fantasy
 * Score) gate on flags here. The shape is open — add new fields as
 * adapters need them.
 */
export interface StatAdapterOptions {
  /**
   * Enable PrizePicks Hitter FS / Underdog Fantasy Score auto-grading
   * for MLB batters. Off by default because the formulas require fields
   * (HBP for PrizePicks) that not all data feeds carry; flip it on once
   * your upstream parser populates the needed mlbExtras keys.
   */
  hitterFsAutoGrade?: boolean;
}

/**
 * Adapter receives the gamelog entry, the slip's source app, and an
 * optional opts bag. Adapters are pure: same inputs → same output.
 */
export type StatAdapter = (
  entry: PlayerGameLogEntryShape,
  app: DfsApp,
  opts?: StatAdapterOptions,
) => number | null;
export type AdapterTable = Partial<Record<DfsPropTypeKey, StatAdapter>>;

const registry = new Map<string, AdapterTable>();

/**
 * Register an adapter table for a league. League keys are normalized to
 * uppercase. Re-registering replaces the existing table.
 *
 * To support a new sport:
 *   1. Add the relevant prop keys to `DfsPropTypeKey` and aliases.
 *   2. Build an `AdapterTable` mapping prop keys to extractor functions.
 *   3. Call `registerLeague('YOUR_LEAGUE', YOUR_ADAPTERS)`.
 *
 * @example
 *   registerLeague('EPL', {
 *     'Goals': (entry) => parseInt(entry.points, 10) || 0,
 *   });
 */
export function registerLeague(league: string, adapters: AdapterTable): void {
  if (!league) throw new Error('registerLeague: league must be a non-empty string');
  registry.set(league.toUpperCase(), adapters);
}

/**
 * Remove a league from the registry. Returns true if the league existed
 * and was removed, false otherwise. Useful in tests and for callers that
 * want to override a built-in sport with their own implementation.
 */
export function unregisterLeague(league: string): boolean {
  if (!league) return false;
  return registry.delete(league.toUpperCase());
}

/**
 * Snapshot of currently registered league keys, sorted alphabetically.
 * Useful for "what sports does this engine know about?" UI.
 */
export function getRegisteredLeagues(): readonly string[] {
  return Array.from(registry.keys()).sort();
}

// Built-in sport registrations. Re-importing this module is idempotent
// because Map.set is idempotent on equal references.
registerLeague('NBA', BASKETBALL_ADAPTERS);
registerLeague('WNBA', BASKETBALL_ADAPTERS);
registerLeague('NCAAM', BASKETBALL_ADAPTERS);
registerLeague('NCAAW', BASKETBALL_ADAPTERS);
registerLeague('NFL', NFL_ADAPTERS);
registerLeague('MLB', MLB_ADAPTERS);
registerLeague('NHL', NHL_ADAPTERS);
// v1.0 soccer — all share one table; per-league dispatch is just
// for "which leagues do we know about" surfacing.
registerLeague('EPL', SOCCER_ADAPTERS);
registerLeague('MLS', SOCCER_ADAPTERS);
registerLeague('LALIGA', SOCCER_ADAPTERS);
registerLeague('NWSL', SOCCER_ADAPTERS);
registerLeague('UCL', SOCCER_ADAPTERS);

/**
 * Resolve the adapter table for a league. Returns null when the league
 * isn't registered. Stable since v0.0.1 — now backed by the registry
 * but the public contract is unchanged.
 */
export function getStatAdapter(league: string): AdapterTable | null {
  if (!league) return null;
  return registry.get(league.toUpperCase()) ?? null;
}

/**
 * Resolve a numeric stat for a leg's prop type. Two-step:
 *   1. Normalize the propType to a canonical DfsPropTypeKey.
 *   2. Dispatch to the league's adapter table.
 *
 * Returns null when the prop isn't in our enum, the league has no
 * adapter table, or the adapter can't extract the value (e.g. NFL
 * categories absent on entry, MLB Hitter FS gated off, etc.).
 */
export function extractStatForPropViaRegistry(
  propType: string,
  league: string,
  entry: PlayerGameLogEntryShape,
  app: DfsApp,
  opts?: StatAdapterOptions,
): number | null {
  const key = asDfsPropTypeKey(propType);
  if (!key) return null;
  const table = getStatAdapter(league);
  if (!table) return null;
  const adapter = table[key];
  return adapter ? adapter(entry, app, opts) : null;
}

/**
 * Explained variant of {@link extractStatForPropViaRegistry}. Returns a
 * discriminated union carrying a reason code on failure so callers can
 * distinguish unknown-prop / unsupported-league / prop-not-supported-for-
 * this-league / adapter-returned-null instead of treating every null
 * identically.
 *
 * Use when surfacing manual-grading prompts in UI ("we can't grade
 * Soccer's Yellow Cards yet" vs "this NBA Points leg needs more data").
 */
export function extractStatForPropExplained(
  propType: string,
  league: string,
  entry: PlayerGameLogEntryShape,
  app: DfsApp,
  opts?: StatAdapterOptions,
): StatExtractionResult {
  const key = asDfsPropTypeKey(propType);
  if (!key) {
    return {
      ok: false,
      reason: 'unknown_prop',
      detail: `propType=${JSON.stringify(propType)} not in DfsPropTypeKey or alias table`,
    };
  }
  const table = getStatAdapter(league);
  if (!table) {
    return {
      ok: false,
      reason: 'unsupported_league',
      detail: `league=${JSON.stringify(league)} not registered`,
    };
  }
  const adapter = table[key];
  if (!adapter) {
    return {
      ok: false,
      reason: 'prop_not_supported_for_league',
      detail: `prop=${key} has no adapter for league=${league.toUpperCase()}`,
    };
  }
  const value = adapter(entry, app, opts);
  if (value == null || !Number.isFinite(value)) {
    return {
      ok: false,
      reason: 'adapter_returned_null',
      detail: `prop=${key} league=${league.toUpperCase()} adapter returned ${String(value)}`,
    };
  }
  return { ok: true, value };
}
