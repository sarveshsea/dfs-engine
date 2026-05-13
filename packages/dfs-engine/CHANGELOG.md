# Changelog

## 2.0.0 — Settlement OS

Turns `@buzzr/dfs-engine` into the core package in a small Settlement OS monorepo.

### Added

- **Instance-safe engine:** `createDfsEngine(config)` with isolated league, policy, payout, provider, clock, and audit configuration.
- **End-to-end settlement:** `engine.settleEntry(input, context)` returns status, per-leg decisions, payout split, DNP/push/void/reprice adjustments, provenance, and an audit trail.
- **Provider contracts:** `defineStatProvider`, plus exported `StatProvider`, `GameProvider`, `PlayerResolver`, and `SettlementStore` interfaces for optional SDK plugins.
- **Policy contracts:** `defineBookPolicy`, `defineLeagueAdapter`, and `definePayoutTable` for versioned, overrideable book/league behavior.
- **Lean v2 inputs:** `DfsEntryInput`, `DfsLegInput`, and `DfsSettlementContext`.
- **Buzzr migration adapter:** `adaptBuzzrBetInput(...)` converts the current `CreateDfsBetInput` / `DfsBetLeg` shape to the lean v2 model.
- **Sibling packages:** `@buzzr/dfs-provider-espn` and `@buzzr/dfs-testkit`.

### Changed

- Runtime target is now Node `>=22`.
- CI now runs Node 22 and 24, lint, format check, typecheck, tests, build, docs, pack smoke, and benchmarks.
- Tooling is owned at the monorepo root; package tarballs still publish only dist, README, and license.

### Migration notes

Legacy root exports remain available where practical, but v2 consumers should prefer `createDfsEngine(...)` for new settlement flows.

## 1.0.0 — Reach + stability commitment

Adds Soccer (first non-US-major built-in sport), real benchmarks, a generated docs site, and a semver stability promise. No breaking changes from 0.3.

### Added — Soccer

First non-US-major built-in sport, demonstrating the v0.2 plugin registry actually works for sports that aren't part of the original NBA/NFL/MLB/NHL lineup. Coverage:

- **Leagues:** EPL, MLS, La Liga, NWSL, UEFA Champions League (all share one `SOCCER_ADAPTERS` table; per-league dispatch is just for "which leagues do we know about?" surfacing).
- **Props (6 new):** `Shots`, `Shots on Target`, `Passes Completed`, `Tackles`, `Yellow Cards` (binary; books grade at the 0.5 line), `Pass Accuracy` (parses both `"0.87"` and `"87"` → 87 on the 0..100 scale).
- **Goals + Assists** reuse the canonical flat slots (`points`, `rebounds`) — same source field, per-league dispatch routes to the right table.
- **`PlayerGameLogEntryShape.soccer?`** — new optional field for sport-specific extras (shots, SOT, passes, tackles, cards, accuracy). Adopting Soccer means populating this bag from your data source.

### Added — benchmarks

`vitest bench` suite at `bench/grading.bench.ts` (`npm run bench`). Reference numbers on a Mac M-series:

| Function | ops/sec |
|---|---|
| `gradeLegFromActual` | ~24M |
| `extractStatForPropViaRegistry` (NBA Points) | ~7.5M |
| `gradeDfsBetFromGraded` (5-pick Power) | ~11.5M |
| `recalcMultiplierAfterDnp` | ~20M |
| `applyLegDnp` (6-pick) | ~5.8M |

### Added — docs site

`typedoc` config + GitHub Actions workflow that builds API docs on `v*` tags and deploys to `sarveshsea.github.io/dfs-engine` via GitHub Pages.

### Added — JSDoc disambiguation

Clarifies when to use which variant of duplicate APIs:
- `extractStatForProp` vs `extractStatForPropViaRegistry` vs `extractStatForPropExplained`
- `gradeLegFromActual` vs `gradeLegFromActualExplained`
- `findGameLogCandidates` vs `matchGameLogEntry`

### Stability commitment

**Starting at 1.0, the public API is frozen.** Breaking changes only at major versions. Specifically:

- The exported function signatures in `src/index.ts` won't change in minor/patch releases.
- New sport adapters can be added without breaking changes.
- New props can be appended to `DfsPropTypeKey` and `DFS_PROP_TYPE_KEYS` without breaking changes (consumers iterating those see new entries at the end).
- The plugin registry contract is permanent — `registerLeague(league, adapters)` will keep working with `AdapterTable` shape across 1.x.
- New optional fields can be added to `PlayerGameLogEntryShape` (and analogous interfaces) without breaking changes.

What's NOT covered:
- Payout schedules — books adjust these. Schedule corrections ship as patch releases with a note.
- Behavior of `*Explained` failure reasons — new reason codes may be added to the union (additive change).

### Tests

314 passing across 15 files (was 281 / 14 in v0.3).

### Migration notes

No breaking changes. Consumers iterating `DFS_PROP_TYPE_KEYS` will see the 6 new Soccer keys appended at the end.

## 0.3.0 — Coverage + DX

Adds 14 new props across the four built-in sports, runtime input validators, contributor onboarding (CONTRIBUTING.md + examples/), and ESLint/Prettier configs. No breaking changes.

### Added — props

| Sport | New props |
|---|---|
| NBA / WNBA / NCAAM / NCAAW | `Pts+Stls`, `Pts+Blks`, `Stls+Blks` (alias `Defensive Stats`), `Double-Double`, `Triple-Double` |
| NFL | `Longest Reception`, `Longest Rush`, `Longest Pass` |
| MLB (batter) | `Singles`, `Doubles`, `Triples`, `Runs` |
| MLB (pitcher) | `Pitching Outs` (IP × 3 with .1 / .2 fractional handling) |
| NHL | `Plus/Minus` |

`Double-Double` and `Triple-Double` return `1` (achieved) or `0` (not) — books grade them at the standard `0.5` line, so over=achievement, under=missed. The token canonicalizer also learned `stl` and `blk`, so combo aliases like `"Pts+Stl"` and `"PTS+BLK"` resolve via tokenization.

### Added — DX

- **`validatePlayerGameLogEntryShape`** and **`validateDfsBetLeg`** — runtime validators for system-boundary inputs (LLM responses, webhooks, cross-process payloads). Both return `{ ok: true; value: T } | { ok: false; errors: string[] }` with field-level error messages.
- **`CONTRIBUTING.md`** — worked-example walkthrough for adding props, adding sports, and writing tests.
- **`examples/`** directory — four copy-paste-runnable scripts covering single-leg grading, full-bet settlement, DNP recompute, and registering a custom sport (Soccer).
- **ESLint + Prettier** — typescript-eslint recommended rules, opinionated formatter defaults. Scripts: `npm run lint`, `npm run format`, `npm run format:check`. `prepublishOnly` now gates on lint passing.

### Tests

- 281 passing across 14 files (was 232 / 12 in v0.2).
- New: `tests/v03-new-props.test.ts` (32) and `tests/validators.test.ts` (17).

### Migration notes

No breaking changes. New canonical prop keys are additive on `DfsPropTypeKey` and `DFS_PROP_TYPE_KEYS`; consumers iterating those will see the new entries at the end. New aliases are additive on the normalizer.

## 0.2.0 — Foundations

This release focuses on accuracy, extensibility, and stronger error
signaling. Three pure helpers from the original Buzzr extraction were
brought over, the hardcoded sport dispatch is now a real registry, and
silent failures are addressable via new `*Explained` variants.

### Added

- **Plugin registry for sport adapters.** `registerLeague(league, adapters)`,
  `unregisterLeague(league)`, and `getRegisteredLeagues()` let consumers
  add custom sports without forking. Built-in tables (NBA/WNBA/NCAAM/
  NCAAW, NFL, MLB, NHL) auto-register on module import. `getStatAdapter`
  delegates to the registry; its public contract is unchanged.
- **Typed Result variants.** `extractStatForPropExplained` returns a
  discriminated union with reason codes (`unknown_prop` |
  `unsupported_league` | `prop_not_supported_for_league` |
  `adapter_returned_null`). `gradeLegFromActualExplained` distinguishes
  clean grades from `'pending'` and `'unparseable_actual'`.
- **Reconciliation windows.** `RECONCILIATION_WINDOW_MS`,
  `SUPPORTED_RECONCILIATION_LEAGUES`, `MAX_RECONCILIATION_WINDOW_MS`,
  and `isWithinReconciliationWindow(league, settledAt, now?)` for
  re-grading bets against late ESPN stat corrections.
- **Live-update helpers.** `shouldWriteLiveActual` (transient-null
  guard), `buildLiveSnapshot`, `buildLiveLegAlertTitle` (4-state
  push-title format).
- **Boxscore → gamelog adapter.** `boxScorePlayerToGameLogShape` and
  `findAndConvertBoxScorePlayer` for NHL Hits and Blocked Shots, which
  ESPN ships on the boxscore endpoint but not the gamelog.
  `BoxScorePlayer` / `BoxScoreTeam` shapes are exported so callers
  using other data sources can adapt them upstream.
- **StatAdapterOptions.** Adapters now accept an optional third `opts`
  arg; current consumer is MLB Hitter FS / Fantasy Score auto-grading
  via `opts.hitterFsAutoGrade`.

### Fixed

- **Doubleheader silent-pick.** `findGameLogCandidates(null, entries)`
  previously returned `[entries[0]]`, picking the wrong game on
  doubleheaders (entries sorted descending = most recent first, but
  a bet placed for tonight should match tonight's gamelog, not last
  night's). Default is now `[]`. Pass `opts.assumeFirst: true` to
  opt into the legacy behavior. `matchGameLogEntry` widens the same
  way.
- **NaN / Infinity grading.** `gradeLegFromActual` returned `'lost'`
  for `NaN` / `Infinity` actuals because the NaN comparison fell
  through to `actual > line` (always false). Now returns `'pending'`.
  Callers that need the new reason explicitly can use
  `gradeLegFromActualExplained` → `'unparseable_actual'`.
- **MLB Hitter FS portability.** The auto-grade gate moved from
  `process.env.HITTER_FS_AUTO_GRADE` to `opts.hitterFsAutoGrade`.
  The env-var read didn't replace cleanly in browser / React Native
  bundles; the explicit option does.

### Tests

- 232 passing across 12 files (was 116 across 7 in v0.0.1).
- New: NHL adapters (22), grade-bet (10), find-game-log-candidates
  (15), reconciliation-windows (22), live-helpers (11),
  boxscore-shape (10), registry (10), result (15).

### Migration notes

Most callers don't need changes. Two behavior changes to watch for:

1. **`findGameLogCandidates(null, entries)`** previously returned
   `[entries[0]]`; now returns `[]`. If your code relied on the silent
   pick, pass `{ assumeFirst: true }`.
2. **`gradeLegFromActual(_, _, NaN)`** previously returned `'lost'`;
   now returns `'pending'`. Almost certainly the fix you want, but
   audit any callers that asserted on `'lost'` for non-finite inputs.

## 0.0.1 — Initial extract

First public release. Pure-functional DFS prop grading, payouts, and
stat normalization extracted from Buzzr. ~1.6K LOC, 116 tests across
basketball / NFL / MLB / NHL.
