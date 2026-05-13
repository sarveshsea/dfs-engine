# Buzzr DFS Settlement OS

Monorepo for the Buzzr DFS settlement packages.

## Packages

| Package | Purpose |
|---|---|
| `@buzzr/dfs-engine` | Core zero-runtime-dependency settlement engine, grading math, policies, adapters, and v1 compatibility exports. |
| `@buzzr/dfs-provider-espn` | Optional provider contract package for wiring ESPN-shaped gamelog data into the engine. |
| `@buzzr/dfs-testkit` | Golden fixture builders, mock providers, and contract helpers for consumers and Buzzr app tests. |

## Commands

```bash
npm ci
npm run typecheck
npm test
npm run build
```
