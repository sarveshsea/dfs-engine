/**
 * NHL stat adapters (Wave 5 H.nhl).
 *
 * Skater and goalie props share the canonical keys but read different
 * flat-field positions because the gamelog parser remaps ESPN's
 * skater-vs-goalie label sets onto the same shape. The discriminator
 * is `entry.nhlPosition` ('skater' | 'goalie' | null) — every adapter
 * guards on it so a misrouted entry returns null rather than reading
 * the wrong field's value.
 *
 * Field mapping (set by the parser):
 *
 *   Skater entries:
 *     points    = G       (goals)
 *     rebounds  = A       (assists)
 *     assists   = PTS     (G+A — ESPN ships this pre-computed; the
 *                          Points adapter falls back to summing
 *                          points+rebounds when a boxscore-derived
 *                          entry doesn't have PTS)
 *     steals    = S       (shots on goal)
 *     blocks    = '-'     (BS not in gamelog endpoint — boxscore-only)
 *     turnovers = '-'     (HT not in gamelog endpoint — boxscore-only)
 *     minutes   = TOI/G   ("18:23" mm:ss; parsed to fractional minutes)
 *     fg        = PPG     (power-play goals)
 *     threeP    = PPA     (power-play assists)
 *     ft        = SHG     (short-handed goals — unused by adapters)
 *     plusMinus = +/-     (unused by adapters)
 *
 *   Goalie entries:
 *     points    = SV      (saves)
 *     rebounds  = GA      (goals against)
 *     assists   = SA      (shots against)
 *     steals    = SV%     (".923" decimal — verbatim, books use same scale)
 *     blocks    = GAA
 *     turnovers = SO      (shutouts)
 *     fg        = WINS
 *     threeP    = L
 *     ft        = OTL
 *     plusMinus = GS      (games started)
 *     minutes   = TOI/G
 *
 * Hits and Blocked Shots: NOT in ESPN's gamelog endpoint. Those legs
 * route through the watcher's SOURCE_OF_TRUTH map to a boxscore-derived
 * entry where the boxScoreToGameLogShape adapter fills entry.turnovers
 * (= HT) and entry.blocks (= BS). Adapter logic is identical for both
 * fetch paths thanks to the shared shape.
 *
 * Power Play Points: gamelog only (boxscore doesn't surface PPG/PPA on
 * its labels). For NHL bets settled via boxscore-only, PPP returns null
 * and the leg falls to manual-settle. Documented gap; followup if it
 * becomes load-bearing.
 *
 * Mirror: supabase/functions/_shared/dfs-stat-adapters/nhl.ts.
 */
import type { DfsPropTypeKey } from '../prop-normalizer';
import type { StatAdapter } from './index';

function numOrNull(raw: string | undefined): number | null {
  if (!raw || raw === '-' || raw === '—') return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse ESPN's TOI string ("18:23") into fractional minutes (18.38).
 * Books set TOI lines on a decimal-minutes scale — truncating seconds
 * (returning 18) would systematically misgrade values in the 30-second
 * band of the line. Round to 2 decimals to keep tests stable against
 * float noise.
 *
 * Returns null on:
 *   - missing / empty value
 *   - 'DNP' / '-' / '—'
 *   - malformed strings (no colon, non-numeric components)
 */
function parseToiToMinutes(raw: string | undefined): number | null {
  if (!raw || raw === '-' || raw === '—') return null;
  const trimmed = raw.trim();
  if (/^DNP$/i.test(trimmed)) return null;
  if (!trimmed.includes(':')) {
    // Some endpoints might ship plain minutes; accept that too.
    const n = parseFloat(trimmed);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
  }
  const [minPart, secPart] = trimmed.split(':');
  const m = parseInt(minPart, 10);
  const s = parseInt(secPart, 10);
  if (!Number.isFinite(m) || !Number.isFinite(s) || m < 0 || s < 0 || s >= 60) return null;
  return Math.round((m + s / 60) * 100) / 100;
}

/** Skater-only: returns null on goalie entries, else reads `extract`. */
function skaterOnly(extract: StatAdapter): StatAdapter {
  return (entry, app) => {
    if (entry.nhlPosition === 'goalie') return null;
    return extract(entry, app);
  };
}

/** Goalie-only: returns null on skater entries, else reads `extract`. */
function goalieOnly(extract: StatAdapter): StatAdapter {
  return (entry, app) => {
    if (entry.nhlPosition === 'skater') return null;
    return extract(entry, app);
  };
}

export const NHL_ADAPTERS: Partial<Record<DfsPropTypeKey, StatAdapter>> = {
  // Skater props
  Goals: skaterOnly((e) => numOrNull(e.points)),
  Assists: skaterOnly((e) => numOrNull(e.rebounds)),
  // Points = G+A. Gamelog ships PTS pre-computed (entry.assists). Boxscore-
  // derived entries don't have PTS, so we fall back to summing G+A.
  Points: skaterOnly((e) => {
    const direct = numOrNull(e.assists);
    if (direct != null) return direct;
    const g = numOrNull(e.points);
    const a = numOrNull(e.rebounds);
    if (g == null || a == null) return null;
    return g + a;
  }),
  'Shots on Goal': skaterOnly((e) => numOrNull(e.steals)),
  'Time On Ice': (e) => parseToiToMinutes(e.minutes), // both positions
  // Power Play Points = PPG + PPA. Gamelog-only — boxscore-derived entries
  // leave fg / threeP empty, so this returns null and the leg falls to
  // manual-settle. Documented gap in the file-level docstring.
  'Power Play Points': skaterOnly((e) => {
    const ppg = numOrNull(e.fg);
    const ppa = numOrNull(e.threeP);
    if (ppg == null && ppa == null) return null;
    return (ppg ?? 0) + (ppa ?? 0);
  }),
  // Boxscore-only props — gamelog parser leaves these as '-' so adapters
  // null-return for gamelog entries; boxScoreToGameLogShape populates
  // them for boxscore-derived entries.
  Hits: skaterOnly((e) => numOrNull(e.turnovers)),
  'Blocked Shots': skaterOnly((e) => numOrNull(e.blocks)),

  // Goalie props
  Saves: goalieOnly((e) => numOrNull(e.points)),
  'Goals Against': goalieOnly((e) => numOrNull(e.rebounds)),
  // SV% verbatim from ESPN as ".923". Books use the same scale; if that
  // ever stops being true, add an explicit `/ 100` transform here with
  // a smoke-test note.
  'Saves Percentage': goalieOnly((e) => numOrNull(e.steals)),
  // v0.3 — Plus/Minus is a skater-only flat field that the parser fills
  // for both regulation and overtime totals (ESPN shows the season-cum
  // value; per-game is on the gamelog row). Goalies sometimes have a
  // plusMinus column but it's structurally meaningless — guard it out.
  'Plus/Minus': skaterOnly((e) => numOrNull(e.plusMinus)),
};
