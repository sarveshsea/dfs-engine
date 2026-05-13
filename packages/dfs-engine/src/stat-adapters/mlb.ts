/**
 * MLB stat adapters.
 *
 * Background: parseGamelog remaps ESPN's MLB labels onto the flat
 * PlayerGameLogEntry fields differently for batters vs pitchers. For
 * batters:
 *   points = H, rebounds = HR, assists = RBI, steals = SB, blocks = BB,
 *   turnovers = SO; entry.mlbExtras = { singles, doubles, triples, runs }
 * For pitchers:
 *   points = SO/K, rebounds = IP, assists = ER, steals = BB (allowed),
 *   blocks = HR (allowed), turnovers = H (allowed);
 *   entry.mlbExtras = { pitchesThrown }
 *
 * Role discrimination is mandatory because batter and pitcher rows
 * remap the SAME flat fields to different stats — `Walks` (batter BB)
 * lives at entry.blocks while `Walks Allowed` (pitcher BB) lives at
 * entry.steals. Reading the wrong slot silently mis-grades. Adapters
 * gate on `entry.mlbRole` and return null when the role doesn't match,
 * which surfaces the leg as manual-settlement rather than wrong.
 *
 * Singles is computed in the parser as H − 2B − 3B − HR (ESPN doesn't
 * surface 1B). Pitches Thrown is parsed from PC-ST's LHS ("95-62" →
 * "95"). Both are nested under `entry.mlbExtras` to keep the flat
 * entry shape from accumulating per-sport fields — same pattern NFL
 * uses for its passing/rushing/receiving categories.
 *
 * Hitter FS / Fantasy Score is the per-book composite; both canonical
 * keys route to one computeFantasyScore(entry, app) and branch on app:
 *
 *   PrizePicks Hitter FS = 3·1B + 5·2B + 8·3B + 10·HR + 2·R + 2·RBI
 *                          + 2·BB + 2·HBP + 5·SB
 *   Underdog Fantasy Score (hitters) = 1·1B + 2·2B + 3·3B + 4·HR
 *                                       (Total Bases — Underdog tracks
 *                                        BB / SB / R / RBI as separate
 *                                        prop types)
 *
 * HBP rationale: ESPN doesn't surface HBP at the per-game player level,
 * so the field is intentionally absent from the canonical mlbExtras
 * shape. The PrizePicks formula reads HBP via a relaxed cast on
 * mlbExtras, gets undefined, and returns null — staying gate-off-only
 * until a feed onboards HBP. The Underdog formula doesn't read HBP and
 * works once the gate flips.
 *
 * Auto-grade is gated by HITTER_FS_AUTO_GRADE; default off so the
 * adapter returns null and legs fall to manual-settle until the
 * formula is reconciled against real settled bets.
 */
import type { DfsPropTypeKey } from '../prop-normalizer';
import type { PlayerGameLogEntryShape } from '../grading';
import type { DfsApp } from '../types';
import type { StatAdapter, StatAdapterOptions } from './index';

function numOrNull(raw: string | undefined): number | null {
  if (!raw || raw === '-' || raw === '—') return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function batterOnly(read: (entry: PlayerGameLogEntryShape) => number | null): StatAdapter {
  return (entry) => (entry.mlbRole === 'batter' ? read(entry) : null);
}

function pitcherOnly(read: (entry: PlayerGameLogEntryShape) => number | null): StatAdapter {
  return (entry) => (entry.mlbRole === 'pitcher' ? read(entry) : null);
}

/**
 * Total Bases: 1·1B + 2·2B + 3·3B + 4·HR. Returns null when any
 * component is missing — partial sums would silently undercount and
 * mis-grade pushes near integer lines.
 */
function totalBases(entry: PlayerGameLogEntryShape): number | null {
  if (entry.mlbRole !== 'batter') return null;
  const singles = numOrNull(entry.mlbExtras?.singles);
  const doubles = numOrNull(entry.mlbExtras?.doubles);
  const triples = numOrNull(entry.mlbExtras?.triples);
  const hr = numOrNull(entry.rebounds); // batter remap: HR
  if (singles == null || doubles == null || triples == null || hr == null) return null;
  return singles + 2 * doubles + 3 * triples + 4 * hr;
}

/**
 * Hits + Runs + RBIs (combo). Same null-on-missing semantics as
 * Total Bases — any missing component returns null.
 */
function hitsRunsRbis(entry: PlayerGameLogEntryShape): number | null {
  if (entry.mlbRole !== 'batter') return null;
  const hits = numOrNull(entry.points); // batter remap: H
  const runs = numOrNull(entry.mlbExtras?.runs);
  const rbi = numOrNull(entry.assists); // batter remap: RBI
  if (hits == null || runs == null || rbi == null) return null;
  return hits + runs + rbi;
}

/**
 * Per-book hitter fantasy score. Returns null when the gate is off OR
 * the entry isn't a batter OR any required component is missing OR the
 * app is unsupported. Caller sees null → leg stays manual-settle.
 *
 * v0.2: the gate is now an explicit option (`opts.hitterFsAutoGrade`)
 * instead of a `process.env` read, so the adapter works in browser /
 * React Native bundles and tests. Pass the flag through the public
 * extract* functions when you want auto-grading enabled.
 */
function computeFantasyScore(
  entry: PlayerGameLogEntryShape,
  app: DfsApp,
  opts?: StatAdapterOptions,
): number | null {
  if (!opts?.hitterFsAutoGrade) return null;
  if (entry.mlbRole !== 'batter') return null;

  const extras = entry.mlbExtras;
  const singles = numOrNull(extras?.singles);
  const doubles = numOrNull(extras?.doubles);
  const triples = numOrNull(extras?.triples);
  const hr = numOrNull(entry.rebounds); // batter remap: HR
  const runs = numOrNull(extras?.runs);
  const rbi = numOrNull(entry.assists); // batter remap: RBI
  const bb = numOrNull(entry.blocks); // batter remap: BB
  const sb = numOrNull(entry.steals); // batter remap: SB
  // HBP referenced via a relaxed cast — see file-header HBP rationale.
  // When an upstream feed eventually populates mlbExtras.hbp, the
  // formula picks it up without a code change.
  const hbp = numOrNull((extras as { hbp?: string } | undefined)?.hbp);

  if (app === 'prizepicks') {
    // 3·1B + 5·2B + 8·3B + 10·HR + 2·R + 2·RBI + 2·BB + 2·HBP + 5·SB
    if (
      singles == null ||
      doubles == null ||
      triples == null ||
      hr == null ||
      runs == null ||
      rbi == null ||
      bb == null ||
      sb == null ||
      hbp == null
    ) {
      return null;
    }
    return (
      3 * singles +
      5 * doubles +
      8 * triples +
      10 * hr +
      2 * runs +
      2 * rbi +
      2 * bb +
      2 * hbp +
      5 * sb
    );
  }

  if (app === 'underdog') {
    // 1·1B + 2·2B + 3·3B + 4·HR (Total Bases). Underdog tracks BB / SB /
    // R / RBI as separate prop types, so they're intentionally absent
    // from this formula even though we have them on the entry.
    if (singles == null || doubles == null || triples == null || hr == null) {
      return null;
    }
    return singles + 2 * doubles + 3 * triples + 4 * hr;
  }

  return null;
}

export const MLB_ADAPTERS: Partial<Record<DfsPropTypeKey, StatAdapter>> = {
  // Batter-side single stats (consolidated from Phase B's legacy regex)
  Hits: batterOnly((e) => numOrNull(e.points)),
  'Home Runs': batterOnly((e) => numOrNull(e.rebounds)),
  RBI: batterOnly((e) => numOrNull(e.assists)),
  Walks: batterOnly((e) => numOrNull(e.blocks)),
  'Stolen Bases': batterOnly((e) => numOrNull(e.steals)),
  'Total Bases': totalBases,
  'Hits+Runs+RBIs': hitsRunsRbis,
  // Pitcher-side
  Strikeouts: pitcherOnly((e) => numOrNull(e.points)),
  'Earned Runs': pitcherOnly((e) => numOrNull(e.assists)),
  // Innings Pitched is fractional in baseball convention (.1 = 1/3 inning,
  // .2 = 2/3 inning) but ESPN reports it as a decimal-looking string and
  // we grade against the line as-is. Preserved verbatim from Phase B's
  // legacy regex behavior to avoid grading drift on the consolidation.
  'Innings Pitched': pitcherOnly((e) => numOrNull(e.rebounds)),
  'Walks Allowed': pitcherOnly((e) => numOrNull(e.steals)),
  'Hits Allowed': pitcherOnly((e) => numOrNull(e.turnovers)),
  'Pitches Thrown': pitcherOnly((e) => numOrNull(e.mlbExtras?.pitchesThrown)),
  // Per-book composite. Both keys route to the same dispatcher; the
  // verbatim slip propType stays on the leg so the UI displays whichever
  // name the user saw.
  'Hitter FS': computeFantasyScore,
  'Fantasy Score': computeFantasyScore,
  // v0.3 — batter peripherals from mlbExtras (parser fills these from
  // ESPN's hits-by-type breakdown; singles are computed as H − 2B − 3B − HR).
  Singles: batterOnly((e) => numOrNull(e.mlbExtras?.singles)),
  Doubles: batterOnly((e) => numOrNull(e.mlbExtras?.doubles)),
  Triples: batterOnly((e) => numOrNull(e.mlbExtras?.triples)),
  Runs: batterOnly((e) => numOrNull(e.mlbExtras?.runs)),
  // v0.3 — pitcher Pitching Outs = IP × 3 (a 6.1 IP line resolves to 19
  // outs). Books shifted to "outs recorded" instead of fractional IP for
  // cleaner integer lines on PrizePicks; this maps the same source data.
  'Pitching Outs': pitcherOnly((e) => {
    const ip = numOrNull(e.rebounds);
    if (ip == null) return null;
    // Convert baseball-fractional IP (.1 = 1/3 inning, .2 = 2/3 inning)
    // into integer outs. Math: floor(IP) × 3 + (frac == .1 ? 1 : .2 ? 2 : 0).
    const whole = Math.trunc(ip);
    const frac = Math.round((ip - whole) * 10);
    if (frac !== 0 && frac !== 1 && frac !== 2) return null;
    return whole * 3 + frac;
  }),
};
