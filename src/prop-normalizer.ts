/**
 * DFS prop-type normalizer.
 *
 * The OCR / parser produces propType strings verbatim from the slip
 * ("3PT Made", "3PTM", "Threes" all show up depending on the book and
 * screenshot quality). Every leg-write site funnels through
 * normalizeDfsPropType so the rest of the system sees a finite enum
 * (DfsPropTypeKey). Adapter map keys are these canonical strings.
 *
 * Aliases are intentionally narrow at v1:
 *   - Basketball aliases ship now (verified against sample screenshots).
 *   - NFL / MLB aliases are deferred — unknown variants pass through
 *     verbatim and the adapter returns null, which surfaces the leg as
 *     "manual settlement only" rather than silently miscategorising.
 *
 * Mirror: supabase/functions/_shared/dfs-prop-normalizer.ts. Keep
 * functionally identical.
 */

export type DfsPropTypeKey =
  // basketball (NBA / WNBA / NCAAM)
  | 'Points'
  | 'Rebounds'
  | 'Assists'
  | 'Steals'
  | 'Blocks'
  | 'Turnovers'
  | '3-Pointers Made'
  | 'Pts+Rebs+Asts'
  | 'Pts+Rebs'
  | 'Pts+Asts'
  | 'Rebs+Asts'
  // basketball v0.3 additions
  | 'Pts+Stls'
  | 'Pts+Blks'
  | 'Stls+Blks'
  | 'Double-Double'
  | 'Triple-Double'
  // NFL
  | 'Pass Yards'
  | 'Pass Completions'
  | 'Pass Attempts'
  | 'Pass TDs'
  | 'Interceptions'
  | 'Rush Yards'
  | 'Rush Attempts'
  | 'Rush TDs'
  | 'Receptions'
  | 'Receiving Yards'
  | 'Receiving TDs'
  | 'Pass+Rush Yds'
  | 'Pass+Rush+Rec Yds'
  | 'Rush+Rec TDs'
  | 'Pass+Rush TDs'
  | 'Pass+Rush+Rec TDs'
  // NFL v0.3 additions
  | 'Longest Reception'
  | 'Longest Rush'
  | 'Longest Pass'
  // MLB — batter-side (Wave 4 H.mlb-extras consolidates Phase B's
  // legacy-regex props into the registry alongside the new ones)
  | 'Hits'
  | 'Home Runs'
  | 'RBI'
  | 'Walks'
  | 'Stolen Bases'
  | 'Total Bases'
  | 'Hits+Runs+RBIs'
  // MLB batter v0.3 additions
  | 'Singles'
  | 'Doubles'
  | 'Triples'
  | 'Runs'
  // MLB — pitcher-side (role-discriminated; mlbRole === 'pitcher')
  | 'Strikeouts'
  | 'Earned Runs'
  | 'Innings Pitched'
  | 'Walks Allowed'
  | 'Hits Allowed'
  | 'Pitches Thrown'
  // MLB pitcher v0.3 additions
  | 'Pitching Outs'
  // MLB composite (Phase B.5). Both literals are canonical because the
  // verbatim slip text differs by book — PrizePicks displays "Hitter FS",
  // Underdog displays "Fantasy Score" — and the verify card surfaces the
  // string the user saw on the slip. The adapter dispatches both keys to
  // the same computeFantasyScore(entry, app) with per-book formula
  // branching.
  | 'Hitter FS'
  | 'Fantasy Score'
  // NHL (Wave 5 H.nhl). 'Goals' / 'Assists' / 'Points' / 'Hits' are
  // intentionally reused across leagues — getStatAdapter(league) routes
  // each to the right per-league table, so 'Points' resolves to NBA's
  // points adapter for an NBA bet, to NHL's G+A adapter for an NHL bet,
  // and 'Hits' resolves to MLB batter hits or NHL skater body-checks.
  // (Basketball already exports 'Points' / 'Assists'; MLB H.mlb-extras
  // exports 'Hits'; we add only the keys NHL needs that aren't already
  // canonical here.)
  | 'Time On Ice'
  | 'Shots on Goal'
  | 'Goals'
  | 'Blocked Shots'
  | 'Power Play Points'
  | 'Saves'
  | 'Goals Against'
  | 'Saves Percentage'
  // NHL v0.3 additions
  | 'Plus/Minus';

export const DFS_PROP_TYPE_KEYS: readonly DfsPropTypeKey[] = [
  'Points',
  'Rebounds',
  'Assists',
  'Steals',
  'Blocks',
  'Turnovers',
  '3-Pointers Made',
  'Pts+Rebs+Asts',
  'Pts+Rebs',
  'Pts+Asts',
  'Rebs+Asts',
  'Pass Yards',
  'Pass Completions',
  'Pass Attempts',
  'Pass TDs',
  'Interceptions',
  'Rush Yards',
  'Rush Attempts',
  'Rush TDs',
  'Receptions',
  'Receiving Yards',
  'Receiving TDs',
  'Pass+Rush Yds',
  'Pass+Rush+Rec Yds',
  'Rush+Rec TDs',
  'Pass+Rush TDs',
  'Pass+Rush+Rec TDs',
  'Hits',
  'Home Runs',
  'RBI',
  'Walks',
  'Stolen Bases',
  'Total Bases',
  'Hits+Runs+RBIs',
  'Strikeouts',
  'Earned Runs',
  'Innings Pitched',
  'Walks Allowed',
  'Hits Allowed',
  'Pitches Thrown',
  'Hitter FS',
  'Fantasy Score',
  'Time On Ice',
  'Shots on Goal',
  'Goals',
  'Blocked Shots',
  'Power Play Points',
  'Saves',
  'Goals Against',
  'Saves Percentage',
  // v0.3 additions (kept at the bottom so consumers iterating with
  // assumptions about the v0.0.1 ordering aren't broken)
  'Pts+Stls',
  'Pts+Blks',
  'Stls+Blks',
  'Double-Double',
  'Triple-Double',
  'Longest Reception',
  'Longest Rush',
  'Longest Pass',
  'Singles',
  'Doubles',
  'Triples',
  'Runs',
  'Pitching Outs',
  'Plus/Minus',
] as const;

/**
 * Alias table — case-insensitive lookups against a whitespace-collapsed
 * input. Canonical exact strings (with their lowercased form) are
 * registered automatically below; entries here are the additional
 * variants we've confirmed from real slips.
 */
const BASKETBALL_ALIASES: Record<string, DfsPropTypeKey> = {
  pts: 'Points',
  reb: 'Rebounds',
  rebs: 'Rebounds',
  ast: 'Assists',
  asts: 'Assists',
  stl: 'Steals',
  stls: 'Steals',
  blk: 'Blocks',
  blks: 'Blocks',
  to: 'Turnovers',
  tos: 'Turnovers',
  threes: '3-Pointers Made',
  '3pt made': '3-Pointers Made',
  '3-pt made': '3-Pointers Made',
  '3ptm': '3-Pointers Made',
  '3pm': '3-Pointers Made',
  // combo variants — input whitespace gets collapsed before lookup,
  // so spaced and unspaced forms both resolve.
  'pts + rebs + asts': 'Pts+Rebs+Asts',
  'points + rebounds + assists': 'Pts+Rebs+Asts',
  'pts + rebs': 'Pts+Rebs',
  'points + rebounds': 'Pts+Rebs',
  'pts + asts': 'Pts+Asts',
  'points + assists': 'Pts+Asts',
  'rebs + asts': 'Rebs+Asts',
  'rebounds + assists': 'Rebs+Asts',
  // v0.3: defensive combos + double / triple double
  'pts + stls': 'Pts+Stls',
  'points + steals': 'Pts+Stls',
  'pts + blks': 'Pts+Blks',
  'points + blocks': 'Pts+Blks',
  'stls + blks': 'Stls+Blks',
  'steals + blocks': 'Stls+Blks',
  'defensive stats': 'Stls+Blks',
  'def stats': 'Stls+Blks',
  dd: 'Double-Double',
  'double double': 'Double-Double',
  'double-double': 'Double-Double',
  td: 'Triple-Double',
  'triple double': 'Triple-Double',
  'triple-double': 'Triple-Double',
};

/**
 * NHL slip variants observed in the wild. Canonical exact strings are
 * registered automatically below — these are the additional aliases.
 */
const NHL_ALIASES: Record<string, DfsPropTypeKey> = {
  toi: 'Time On Ice',
  'time on ice': 'Time On Ice',
  sog: 'Shots on Goal',
  shots: 'Shots on Goal',
  'shots on goal': 'Shots on Goal',
  goal: 'Goals',
  goals: 'Goals',
  g: 'Goals',
  ast: 'Assists',
  asst: 'Assists',
  // 'pts' and 'points' are already aliased by basketball; per-league
  // dispatch routes them to NHL's G+A adapter for NHL bets.
  hit: 'Hits',
  hits: 'Hits',
  'blocked shots': 'Blocked Shots',
  'blocks (skater)': 'Blocked Shots',
  bs: 'Blocked Shots',
  ppp: 'Power Play Points',
  'power play points': 'Power Play Points',
  'pp points': 'Power Play Points',
  saves: 'Saves',
  sv: 'Saves',
  'goals against': 'Goals Against',
  ga: 'Goals Against',
  'save %': 'Saves Percentage',
  'sv%': 'Saves Percentage',
  'save percentage': 'Saves Percentage',
  'saves percentage': 'Saves Percentage',
  'saves%': 'Saves Percentage',
  // v0.3 — Plus/Minus variants. Slip text omits the slash on PrizePicks
  // ("Plus Minus") and uses the symbol on Underdog ("+/-").
  '+/-': 'Plus/Minus',
  'plus minus': 'Plus/Minus',
  plusminus: 'Plus/Minus',
  '+/-': 'Plus/Minus',
};

const ALL_ALIASES: Record<string, DfsPropTypeKey> = (() => {
  const out: Record<string, DfsPropTypeKey> = {};
  for (const key of DFS_PROP_TYPE_KEYS) {
    out[key.toLowerCase()] = key;
  }
  for (const [alias, key] of Object.entries(BASKETBALL_ALIASES)) {
    out[alias] = key;
  }
  for (const [alias, key] of Object.entries(NHL_ALIASES)) {
    out[alias] = key;
  }
  return out;
})();

/**
 * Normalize a raw propType string to a canonical DfsPropTypeKey when
 * we recognise it; otherwise return the input cleaned of leading/
 * trailing whitespace. Unknown variants are intentionally preserved
 * verbatim so display-side code still has something to render — the
 * adapter is the gatekeeper that decides whether a string is gradable.
 */
export function normalizeDfsPropType(raw: string): string {
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  const canonical = ALL_ALIASES[trimmed.toLowerCase()];
  if (canonical) return canonical;
  const fromTokens = lookupViaTokenCanonicalization(trimmed.toLowerCase());
  return fromTokens ?? trimmed;
}

/**
 * Type-guard form — returns the canonical key only when the input is a
 * known prop. Useful in adapter dispatch where we want to short-circuit
 * unknown strings to null without a second lookup.
 */
export function asDfsPropTypeKey(raw: string): DfsPropTypeKey | null {
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  const canonical = ALL_ALIASES[trimmed.toLowerCase()];
  if (canonical) return canonical;
  return lookupViaTokenCanonicalization(trimmed.toLowerCase());
}

/**
 * Fallback lookup for combo props that the alias table doesn't list
 * verbatim. The slip OCR surfaces dozens of spellings — "PTS+REB",
 * "pts + reb", "Points + Rebounds", "pt+reb" — that all mean
 * 'Pts+Rebs'. Rather than enumerating every variant, we tokenize on
 * `+`, canonicalize each token to its plural-shorthand form, and
 * rebuild the lookup key in both spaced and unspaced forms.
 *
 * Returns null when the input has no `+` (single-stat props are
 * already covered by the alias table) or when any token is unknown.
 */
function lookupViaTokenCanonicalization(lower: string): DfsPropTypeKey | null {
  if (!lower.includes('+')) return null;
  // NFL combos carry a trailing unit label ("Pass+Rush Yds",
  // "Rush+Rec TDs"). Detect and split it out before tokenizing the
  // body so the per-token canonicalizer doesn't mangle "Yds".
  const trailingMatch = lower.match(/^(.+?)\s+(yds|tds|yards|touchdowns)$/);
  let body = lower;
  let trailing = '';
  if (trailingMatch) {
    body = trailingMatch[1].trim();
    trailing = ' ' + canonicalizeStatToken(trailingMatch[2]);
  }
  const tokens = body
    .split('+')
    .map((t) => canonicalizeStatToken(t.trim()))
    .filter((t) => t.length > 0);
  if (tokens.length < 2) return null;
  const tight = tokens.join('+') + trailing;
  const spaced = tokens.join(' + ') + trailing;
  return ALL_ALIASES[tight] ?? ALL_ALIASES[spaced] ?? null;
}

function canonicalizeStatToken(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  // Basketball stat tokens.
  if (t === 'pt' || t === 'pts' || t === 'point' || t === 'points') return 'pts';
  if (t === 'reb' || t === 'rebs' || t === 'rebound' || t === 'rebounds') return 'rebs';
  if (t === 'ast' || t === 'asts' || t === 'assist' || t === 'assists') return 'asts';
  // v0.3: defensive stat tokens for Pts+Stls / Pts+Blks / Stls+Blks combos.
  if (t === 'stl' || t === 'stls' || t === 'steal' || t === 'steals') return 'stls';
  if (t === 'blk' || t === 'blks' || t === 'block' || t === 'blocks') return 'blks';
  // NFL combo prefixes — kept lowercase, no plural normalization.
  if (t === 'pass' || t === 'passing') return 'pass';
  if (t === 'rush' || t === 'rushing') return 'rush';
  if (t === 'rec' || t === 'receptions' || t === 'receiving') return 'rec';
  // Trailing unit labels (only used after the trailing-match split).
  if (t === 'yd' || t === 'yds' || t === 'yard' || t === 'yards') return 'yds';
  if (t === 'td' || t === 'tds' || t === 'touchdown' || t === 'touchdowns') return 'tds';
  return t;
}
