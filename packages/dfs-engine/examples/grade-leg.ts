/**
 * Example: grade a single leg.
 *
 * Run: npx tsx examples/grade-leg.ts
 */
import { gradeLegFromActual, gradeLegFromActualExplained } from '@buzzr/dfs-engine';

// Player scored 28 against a line of 24.5 over.
console.log(gradeLegFromActual(24.5, 'over', 28));
// → 'won'

console.log(gradeLegFromActual(24.5, 'over', 20));
// → 'lost'

console.log(gradeLegFromActual(24.5, 'over', null));
// → 'pending' (game hasn't ended or stat not available)

// Same logic via the Explained variant — useful when you need to
// distinguish 'pending' from 'unparseable_actual' in the UI.
const result = gradeLegFromActualExplained(24.5, 'over', NaN);
console.log(result);
// → { ok: false, reason: 'unparseable_actual', detail: 'actual=NaN (expected finite number)' }

if (result.ok) {
  console.log(`Leg ${result.status}`);
} else if (result.reason === 'pending') {
  console.log('Settling…');
} else {
  console.log(`Data error: ${result.detail}`);
}
