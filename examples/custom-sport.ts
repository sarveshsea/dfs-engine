/**
 * Example: register a custom sport via the plugin registry.
 *
 * Run: npx tsx examples/custom-sport.ts
 *
 * The built-in registry covers NBA / WNBA / NCAAM / NCAAW / NFL / MLB /
 * NHL. To add Soccer, F1, NASCAR, eSports, or anything else, define an
 * AdapterTable and call registerLeague — no fork needed.
 */
import {
  registerLeague,
  unregisterLeague,
  getRegisteredLeagues,
  extractStatForProp,
  type AdapterTable,
} from '@buzzr/dfs-engine';

// Soccer adapter table. Reuses canonical prop keys ('Goals', 'Assists')
// where they make sense — getStatAdapter routes per-league, so 'Goals'
// for an EPL leg uses this table while 'Goals' for an NHL leg uses the
// NHL table. New canonical keys (e.g. 'Yellow Cards') would go in
// prop-normalizer.ts in a real PR.
const SOCCER_ADAPTERS: AdapterTable = {
  Goals: (entry) => parseInt(entry.points, 10) || null,
  Assists: (entry) => parseInt(entry.rebounds, 10) || null,
  // 'Shots on Goal' is canonical (used by NHL too); reuse here:
  'Shots on Goal': (entry) => parseInt(entry.steals, 10) || null,
};

registerLeague('EPL', SOCCER_ADAPTERS);
registerLeague('MLS', SOCCER_ADAPTERS);
registerLeague('LALIGA', SOCCER_ADAPTERS);

console.log(getRegisteredLeagues());
// → [ 'EPL', 'LALIGA', 'MLS', 'MLB', 'NBA', 'NCAAM', 'NCAAW', 'NFL', 'NHL', 'WNBA' ]

// Adapt your gamelog source to PlayerGameLogEntryShape upstream — fields
// can be repurposed for sports that don't naturally have rebounds /
// assists (here we use rebounds for Assists, steals for Shots on Goal).
const haalandToday = {
  date: '2026-04-12',
  minutes: '90:00',
  points: '2',     // goals
  rebounds: '0',   // assists
  assists: '',
  steals: '5',     // shots on goal
  blocks: '',
  turnovers: '',
  threeP: '',
};

console.log(extractStatForProp('Goals', 'EPL', haalandToday, 'prizepicks')); // → 2
console.log(extractStatForProp('Shots on Goal', 'EPL', haalandToday, 'prizepicks')); // → 5

// Unregister cleans up — useful in tests or when overriding a built-in.
unregisterLeague('EPL');
console.log(extractStatForProp('Goals', 'EPL', haalandToday, 'prizepicks')); // → null
