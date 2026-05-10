# Examples

Runnable copy-paste-friendly examples for `@buzzr/dfs-engine`. In your own project:

```bash
npm install @buzzr/dfs-engine
```

Then copy any of the files in this directory and run with `npx tsx <file>` (or after `tsc` compilation).

Each script prints its output to stdout — no setup, no mocks, no fixtures.

| File | What it shows |
|---|---|
| [grade-leg.ts](./grade-leg.ts) | Grade a single leg with `gradeLegFromActual` and the `*Explained` variant |
| [grade-entry.ts](./grade-entry.ts) | Roll graded legs into a bet result with `gradeDfsBetFromGraded` |
| [dnp-recompute.ts](./dnp-recompute.ts) | Demote a 6-pick to a 5-pick after a DNP and rescale the multiplier |
| [custom-sport.ts](./custom-sport.ts) | Register a custom sport via `registerLeague` and grade a prop against it |
