# Changelog

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
