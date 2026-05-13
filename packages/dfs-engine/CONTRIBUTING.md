# Contributing to `@buzzr/dfs-engine`

Thanks for considering a contribution. This package is intentionally small and focused — pure-functional DFS prop grading, payout math, and stat normalization. PRs that fit the mandate are very welcome; PRs that pull in network/database/UI deps will be redirected to a companion package (see `v1.0` ideas in [CHANGELOG.md](./CHANGELOG.md)).

## Getting set up

```bash
git clone https://github.com/sarveshsea/dfs-engine
cd dfs-engine
npm install
npm run typecheck
npm test
npm run build
```

You'll need Node 18+ (CI runs on 20 and 22).

## What kinds of changes go where

| Change | Where it goes |
|---|---|
| Add a prop to an existing sport | `src/prop-normalizer.ts` (enum + alias) + `src/stat-adapters/<sport>.ts` (adapter) + tests |
| Add a new sport | `src/stat-adapters/<sport>.ts` (new file) + register via `registerLeague` (in your own code or in `src/stat-adapters/index.ts` if it's a built-in) |
| Add a slip-text alias for an existing prop | `src/prop-normalizer.ts` only |
| Fix a payout schedule | `src/payouts.ts` only |
| Fix a grading bug | `src/grading.ts` + a regression test |

If you're not sure, open an issue first.

## How to add a prop

Walk through with a worked example: adding NBA "Free Throws Made".

### 1. Extend the canonical enum

In [src/prop-normalizer.ts](./src/prop-normalizer.ts), add the new key to both the union type and the `DFS_PROP_TYPE_KEYS` array:

```ts
export type DfsPropTypeKey =
  // …existing basketball…
  | 'Free Throws Made';

export const DFS_PROP_TYPE_KEYS: readonly DfsPropTypeKey[] = [
  // …existing…
  'Free Throws Made',
] as const;
```

### 2. Add aliases for slip-text variants

Same file — drop into `BASKETBALL_ALIASES` (or the relevant per-sport map):

```ts
const BASKETBALL_ALIASES: Record<string, DfsPropTypeKey> = {
  // …existing…
  ftm: 'Free Throws Made',
  'free throws': 'Free Throws Made',
  'free throws made': 'Free Throws Made',
};
```

Aliases are matched case-insensitively against whitespace-collapsed input, so `"  ftm  "` and `"FTM"` both resolve.

### 3. Add the adapter

In [src/stat-adapters/basketball.ts](./src/stat-adapters/basketball.ts):

```ts
export const BASKETBALL_ADAPTERS = {
  // …existing…
  'Free Throws Made': (e) => {
    // ESPN ships FT as "made-attempts" e.g. "5-7"
    const parts = e.ft?.split('-');
    if (!parts || parts.length !== 2) return null;
    return numOrNull(parts[0]);
  },
};
```

Adapters return `number` (the value to grade against the line) or `null` (can't compute → leg falls to manual settle).

### 4. Add tests

Create or extend a test file under `tests/`:

```ts
import { extractStatForPropViaRegistry } from '../src';

test('NBA Free Throws Made reads ft', () => {
  const e = nbaEntry({ ft: '5-7' });
  expect(extractStatForPropViaRegistry('Free Throws Made', 'NBA', e, 'prizepicks')).toBe(5);
});

test('returns null on malformed ft', () => {
  expect(
    extractStatForPropViaRegistry('Free Throws Made', 'NBA', nbaEntry({ ft: '-' }), 'prizepicks'),
  ).toBeNull();
});

test('alias FTM resolves', () => {
  expect(asDfsPropTypeKey('FTM')).toBe('Free Throws Made');
});
```

### 5. Verify

```bash
npm run typecheck && npm test
```

### 6. Document the change

Bump the patch (or minor, if introducing a new public symbol) and add a CHANGELOG entry under the next unreleased section.

## How to add a new sport

You don't have to fork — `registerLeague` lets consumers add sports at runtime. But if you're contributing a new built-in:

### 1. Add prop keys + aliases

In [src/prop-normalizer.ts](./src/prop-normalizer.ts), add the new sport's section to `DfsPropTypeKey` and `DFS_PROP_TYPE_KEYS`. Add aliases observed on real slips.

### 2. Build an adapter table

Create `src/stat-adapters/<sport>.ts`:

```ts
import type { DfsPropTypeKey } from '../prop-normalizer';
import type { PlayerGameLogEntryShape } from '../grading';
import type { DfsApp } from '../types';

type StatAdapter = (entry: PlayerGameLogEntryShape, app: DfsApp) => number | null;

function numOrNull(raw: string | undefined): number | null {
  if (!raw || raw === '-' || raw === '—') return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

export const SOCCER_ADAPTERS: Partial<Record<DfsPropTypeKey, StatAdapter>> = {
  Goals: (e) => numOrNull(e.points),
  Assists: (e) => numOrNull(e.rebounds),
  // …
};
```

Most adapters won't need the `app` arg — accept it and ignore it. The MLB Hitter FS adapter is the only built-in that branches on `app`.

### 3. Register the league

In [src/stat-adapters/index.ts](./src/stat-adapters/index.ts), import the table and call `registerLeague`:

```ts
import { SOCCER_ADAPTERS } from './soccer';

registerLeague('EPL', SOCCER_ADAPTERS);
registerLeague('MLS', SOCCER_ADAPTERS);
registerLeague('LALIGA', SOCCER_ADAPTERS);
```

Re-export the table from `src/index.ts` so consumers can override per-prop:

```ts
export { SOCCER_ADAPTERS } from './stat-adapters/soccer';
```

### 4. Tests

Create `tests/<sport>-adapter.test.ts`. Cover every prop, the role discriminator (if applicable), and at least one alias resolution.

### 5. Fixture

If your sport's data shape requires fields not currently in `PlayerGameLogEntryShape`, propose the additions in your PR description. The shape is intentionally minimal so it doesn't accumulate per-sport fields — sport-specific data goes in optional nested objects (see how MLB uses `mlbExtras`).

## Fixtures

Fixtures live in `tests/fixtures/`. Conventions:

- One JSON file per sport (`nfl.json`, `nba.json`, etc.).
- Each entry annotated with `_player` and `_comment` keys (stripped at load time) to identify the source. Include the source URL or game date so the fixture ages clearly.
- Prefer real, unmodified ESPN responses. If you redact identifiers, document it in the fixture's `_comment`.

## Style

- TypeScript strict mode is on. No `any`.
- Prettier + ESLint configs are checked into the repo. Run `npm run lint` (when added) before pushing.
- Comments should explain *why* (constraint, invariant, gotcha), not *what*. Default to no comment.
- Keep adapter logic dependency-free. The package's selling point is `0` runtime deps; a PR that adds one will be redirected.

## Versioning

We use [changesets](https://github.com/changesets/changesets) for releases:

```bash
npx changeset
```

Pick the bump type (patch / minor / major) and write a one-line summary. The CI flow on the maintainer's side aggregates changesets into a release PR.

## Reporting bugs

Open a GitHub issue with:
- The version of `@buzzr/dfs-engine` you're on
- A minimal reproduction (the smallest `extractStatForProp` / `gradeLegFromActual` call that returns the wrong value)
- The expected output and the actual output

If it's a payout schedule that diverged from PrizePicks/Underdog's current published table, link the page where the schedule appears so the fix can cite a source.
