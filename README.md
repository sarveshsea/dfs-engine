# @buzzr/dfs-engine

[![npm version](https://img.shields.io/npm/v/@buzzr/dfs-engine.svg)](https://www.npmjs.com/package/@buzzr/dfs-engine)
[![ci](https://github.com/sarveshsea/dfs-engine/actions/workflows/ci.yml/badge.svg)](https://github.com/sarveshsea/dfs-engine/actions/workflows/ci.yml)

Pure-functional **DFS prop grading**, payout math, and stat normalization for PrizePicks- and Underdog-style daily-fantasy contests. Drop-in TypeScript, zero runtime dependencies, ESM + CJS + `.d.ts` shipped.

```bash
npm install @buzzr/dfs-engine
```

## Why this exists

If you're building a DFS-adjacent tool — a bet tracker, parlay analyzer, EV calculator, social betting app, fantasy coaching tool — you eventually need code that answers:

- **Did this leg hit?** Given a player's actual stat and a slip line, decide won / lost / push.
- **What does the slip pay out?** Given the play type (Power / Flex / Standard), the pick count, the hits, and any boost, compute the multiplier and the withdrawable-vs-bonus split.
- **What happens when a player doesn't play?** Demote a six-pick to a five-pick (PrizePicks) or scratch and rescale (Underdog).
- **What stat goes into a `Pts + Rebs + Asts` leg?** Or `Pass + Rush + Rec Yds`? Or `Hitter FS`?

There's no good open-source TypeScript package for any of this. Everyone reinvents it from scratch, usually wrong. This is the version extracted from [Buzzr](https://buzzr.app), where it's been settling real money lines in production. ~1.6K LOC of pure functions, ~116 tests.

## Quickstart

```ts
import { gradeLegFromActual } from '@buzzr/dfs-engine';

// Player scored 28 against a line of 24.5 over → leg won.
gradeLegFromActual(24.5, 'over', 28);  // 'won'

// Same line, only 20 → leg lost.
gradeLegFromActual(24.5, 'over', 20);  // 'lost'

// Game hasn't ended yet (no stat available) → leg pending.
gradeLegFromActual(24.5, 'over', null); // 'pending'
```

## Examples

### 1. Look up the payout for a pick count + hit count

```ts
import { lookupStandardMultiplier } from '@buzzr/dfs-engine';

// PrizePicks 5-pick Power, all five hit → 20×.
lookupStandardMultiplier({ app: 'prizepicks', playType: 'power', pickCount: 5, hits: 5 });
// → 20

// PrizePicks 6-pick Flex, only 5 of 6 hit → 1.75×.
lookupStandardMultiplier({ app: 'prizepicks', playType: 'flex', pickCount: 6, hits: 5 });
// → 1.75

// Underdog 8-pick Standard, all hit → 100×.
lookupStandardMultiplier({ app: 'underdog', playType: 'underdog_standard', pickCount: 8, hits: 8 });
// → 100
```

### 2. Recompute the multiplier after a DNP

```ts
import { recalcMultiplierAfterDnp } from '@buzzr/dfs-engine';

// One leg on a 6-pick Power scratched. Demote to a 5-pick (all surviving
// must hit), scaling the slip's original multiplier proportionally so
// any boost flows through.
const { newMultiplier } = recalcMultiplierAfterDnp({
  app: 'prizepicks',
  playType: 'power',
  originalPickCount: 6,
  survivingPickCount: 5,
  survivingHits: 5,
  originalMultiplier: 37.5,   // slip-displayed multiplier (post-boost)
});
// newMultiplier ≈ 20 (37.5 × 20/37.5)
```

`recalcMultiplierAfterDnp` returns `{ newMultiplier, usedFallback }`. `usedFallback` is `true` when the payout table doesn't cover the (app, playType, pickCount, hits) tuple — caller should warn the user that the recompute couldn't be verified.

### 3. Extract a stat from a gamelog entry

The grader needs a numeric value to compare against the line. `extractStatForProp` handles the prop-string → stat-value mapping across leagues:

```ts
import { extractStatForProp } from '@buzzr/dfs-engine';

const entry = {
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

extractStatForProp('Points', 'NBA', entry, 'prizepicks');          // 28
extractStatForProp('Pts+Rebs+Asts', 'NBA', entry, 'prizepicks');   // 39
extractStatForProp('3-Pointers Made', 'NBA', entry, 'prizepicks'); // 3
extractStatForProp('Rebounds', 'NBA', entry, 'prizepicks');        // 4
```

Slip-text aliases are normalized — `"3PT Made"`, `"3-pt made"`, `"3ptm"`, `"3pm"`, `"threes"` all resolve to `'3-Pointers Made'`. v0.3 adds 14 new props (Double-Double, Triple-Double, Pts+Stls, Longest Reception/Rush/Pass, MLB Singles/Doubles/Triples/Runs, Pitching Outs, NHL Plus/Minus). See `DFS_PROP_TYPE_KEYS` for the full canonical list (60+ props across NBA / WNBA / NCAAM/W / NFL / MLB / NHL).

### 4. Grade a full entry end-to-end

`gradeDfsBetFromGraded` rolls per-leg statuses into a bet-level result with the boost split:

```ts
import { gradeDfsBetFromGraded } from '@buzzr/dfs-engine';

const result = gradeDfsBetFromGraded({
  app: 'underdog',
  playType: 'underdog_flex',
  legs: [
    { legId: 'a', legStatus: 'won',  /* ...DfsBetLeg fields */ },
    { legId: 'b', legStatus: 'won',  /* ... */ },
    { legId: 'c', legStatus: 'lost', /* ... */ },
    { legId: 'd', legStatus: 'won',  /* ... */ },
    { legId: 'e', legStatus: 'won',  /* ... */ },
  ],
  stake: 10,
  displayedMultiplier: 11.5,      // boosted from base 10×
  baseMultiplier: 10,
  profitBoostPct: null,
});
// 4-of-5 Underdog Flex → standard 2×; scaled by displayed/base ratio.
// → { status: 'won', effectiveMultiplier: 2.3, totalPayout: 23,
//     withdrawablePayout: 20, bonusPayout: 3 }
```

Pending semantics: if any surviving leg is `legStatus: 'pending'`, the whole bet returns `status: 'pending'` — you can call this every time a leg's `actualValue` updates without risk of premature settlement.

## Add your own sport

Built-in coverage is NBA, WNBA, NCAAM/W, NFL, MLB, NHL. The plugin registry lets you add a sport without forking:

```ts
import {
  registerLeague,
  extractStatForProp,
  type AdapterTable,
} from '@buzzr/dfs-engine';

const SOCCER_ADAPTERS: AdapterTable = {
  Goals: (entry) => parseInt(entry.points, 10) || null,
  Assists: (entry) => parseInt(entry.rebounds, 10) || null,
};

registerLeague('EPL', SOCCER_ADAPTERS);
registerLeague('MLS', SOCCER_ADAPTERS);

extractStatForProp('Goals', 'EPL', someEntry, 'prizepicks'); // your value
```

`getRegisteredLeagues()` returns the current list; `unregisterLeague(name)` removes one (useful in tests).

## Explained variants for richer error handling

When `null` isn't specific enough, use the `*Explained` variants — they return a discriminated union with a reason code so you can show the user *why* a leg can't be graded yet:

```ts
import {
  extractStatForPropExplained,
  gradeLegFromActualExplained,
} from '@buzzr/dfs-engine';

const stat = extractStatForPropExplained('Yellow Cards', 'EPL', entry, 'prizepicks');
if (!stat.ok) {
  console.log(stat.reason); // 'unknown_prop' | 'unsupported_league' | 'prop_not_supported_for_league' | 'adapter_returned_null'
  console.log(stat.detail); // human-readable context
}

const grade = gradeLegFromActualExplained(24.5, 'over', NaN);
if (!grade.ok) {
  console.log(grade.reason); // 'pending' | 'unparseable_actual'
}
```

## What's in here

| Module | Highlights |
|---|---|
| `payouts` | `lookupStandardMultiplier`, `recalcMultiplierAfterDnp`, `lookupBaseMultiplier` — full PrizePicks (Power/Flex) and Underdog (Standard/Flex) payout schedules |
| `grading` | `gradeLegFromActual` (+`Explained`), `gradeDfsBetFromGraded`, `applyLegDnp`, `computeBoostSplit`, `detectMidGameDnp`, `reconcileMidGameDnpEntries`, `findGameLogCandidates`, `shouldRegradeLeg`, `extractStatForProp` (+`Explained`) |
| `prop-normalizer` | `normalizeDfsPropType`, `asDfsPropTypeKey`, `DFS_PROP_TYPE_KEYS` |
| `stat-adapters` | `getStatAdapter`, `extractStatForPropViaRegistry`, **`registerLeague`** / **`unregisterLeague`** / **`getRegisteredLeagues`**, plus per-sport tables: `BASKETBALL_ADAPTERS`, `NFL_ADAPTERS`, `MLB_ADAPTERS`, `NHL_ADAPTERS` |
| `reconciliation-windows` | `isWithinReconciliationWindow`, per-league stat-correction TTLs (NBA 2h, NFL 24h, MLB 6h) |
| `live-helpers` | `shouldWriteLiveActual`, `buildLiveSnapshot`, `buildLiveLegAlertTitle` for live-watcher write-paths |
| `boxscore-shape` | `boxScorePlayerToGameLogShape` for sources that only ship some stats on the boxscore (NHL Hits, Blocked Shots) |
| `types` | `DfsApp`, `DfsPlayType`, `DfsLegStatus`, `DfsBetLeg`, `DfsLegGameContext`, `DfsParseResult`, `LegLinkage`, `DfsPayoutSplit`, `BetslipParseMeta`, …and ~15 more |

The `PlayerGameLogEntryShape` the adapters consume is intentionally minimal — define your own gamelog rows that satisfy the shape (`{ date, minutes, points, ... }`) and pipe them in.

See [CHANGELOG.md](./CHANGELOG.md) for what's new in each release. Looking to contribute? Start at [CONTRIBUTING.md](./CONTRIBUTING.md). Copy-paste-runnable demos live in [examples/](./examples/).

## Validating untrusted inputs

When an LLM, webhook, or cross-process source hands you a slip leg or gamelog entry, run it through the validator before grading:

```ts
import { validatePlayerGameLogEntryShape, validateDfsBetLeg } from '@buzzr/dfs-engine';

const v = validatePlayerGameLogEntryShape(maybeEntry);
if (!v.ok) {
  console.error('Bad gamelog entry:', v.errors);
  return;
}
// v.value is now typed as PlayerGameLogEntryShape
```

## Status & caveats

- **Payout tables current as of 2026-05.** PrizePicks and Underdog adjust their schedules periodically; if a recalc looks wrong, check whether the published schedule changed.
- **Slip-displayed multiplier always wins.** Tables are only the demotion ratio baseline — Demon/Goblin/boost markups aren't enumerated.
- **Gamelog parsing is your problem.** This package grades stats; it doesn't fetch them. Adapt ESPN, your own scraper, or a paid data feed to `PlayerGameLogEntryShape` upstream.
- **Sport coverage:** NBA / WNBA / NCAAM (basketball), NFL, MLB (batters + pitchers), NHL (skaters + goalies). Adding a sport means a new `AdapterTable` plus extending `DfsPropTypeKey`.

## Origin

Extracted from [Buzzr](https://buzzr.app), where it settles user bets placed on PrizePicks and Underdog. The Buzzr team has been iterating on this math against real slips and real stat-correction edge cases for two years. The npm package is the same code, just decoupled from the app.

## License

MIT © Sarvesh Chidambaram
