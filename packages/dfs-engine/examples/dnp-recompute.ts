/**
 * Example: recompute the multiplier after a player DNPs.
 *
 * Run: npx tsx examples/dnp-recompute.ts
 *
 * On PrizePicks, when a player on a 6-pick Power Play doesn't suit up,
 * the slip demotes to a 5-pick. Multiplier rescales from 37.5× → 20×.
 * The displayed multiplier on a boosted slip carries the boost ratio
 * through the demotion.
 */
import { recalcMultiplierAfterDnp, lookupStandardMultiplier } from '@buzzr/dfs-engine';

// Look up the standard payout for a (pickCount, hits) tuple.
console.log(
  lookupStandardMultiplier({
    app: 'prizepicks',
    playType: 'power',
    pickCount: 5,
    hits: 5,
  }),
); // → 20

console.log(
  lookupStandardMultiplier({
    app: 'prizepicks',
    playType: 'flex',
    pickCount: 6,
    hits: 5,
  }),
); // → 1.75

// Recompute after a DNP. Original 6-pick Power at 37.5×, one player
// scratched, all 5 surviving legs hit. New multiplier ≈ 20× (the same
// as a clean 5-pick), preserving any boost baked into the original.
const recalc = recalcMultiplierAfterDnp({
  app: 'prizepicks',
  playType: 'power',
  originalPickCount: 6,
  survivingPickCount: 5,
  survivingHits: 5,
  originalMultiplier: 37.5,
});

console.log(recalc); // → { newMultiplier: 20, usedFallback: false }

// `usedFallback: true` would mean the payout table didn't cover the
// (app, playType, pickCount, hits) tuple — caller should warn the user.
// This happens if PrizePicks adjusts a schedule we haven't tracked.
const exotic = recalcMultiplierAfterDnp({
  app: 'prizepicks',
  playType: 'power',
  originalPickCount: 9, // out of range
  survivingPickCount: 8,
  survivingHits: 8,
  originalMultiplier: 100,
});
console.log(exotic); // → { newMultiplier: 100, usedFallback: true }
