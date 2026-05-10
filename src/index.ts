/**
 * @buzzr/dfs-engine — pure-functional DFS prop grading, payouts, and
 * stat normalization for PrizePicks/Underdog-style contests.
 *
 * All exports are pure functions or types — no I/O, no React, no native
 * deps. Feed it data, get grading decisions and payout math back.
 */

// Core DFS types (apps, play types, leg shape, game context, parse result).
export type {
  BetslipParseProvider,
  BetslipParseMeta,
  DfsApp,
  DfsPlayType,
  DfsLegStatus,
  DfsSettlementSource,
  DfsInitialBetStatus,
  DfsSettlementPendingReason,
  DfsBoostType,
  DfsLegGameContext,
  DfsBetLeg,
  LegLiveSnapshot,
  DfsMidGameDnpEntry,
  DfsBetPendingVerification,
  LegLinkageStatus,
  PlayerCandidate,
  LegLinkage,
  LegGradingSnapshot,
  DfsPayoutSplit,
  CreateDfsBetInput,
  DfsPayoutTableEntry,
  DfsParseResult,
} from './types';

// Payout multipliers + DNP recompute.
export {
  lookupStandardMultiplier,
  recalcMultiplierAfterDnp,
  lookupBaseMultiplier,
} from './payouts';

// Prop-type normalization (slip strings → canonical keys).
export {
  DFS_PROP_TYPE_KEYS,
  normalizeDfsPropType,
  asDfsPropTypeKey,
} from './prop-normalizer';
export type { DfsPropTypeKey } from './prop-normalizer';

// Grading: per-leg, per-bet, mid-game DNP, reconciliation.
export {
  extractStatForProp,
  detectMidGameDnp,
  reconcileMidGameDnpEntries,
  gradeLegFromActual,
  shouldRegradeLeg,
  findGameLogCandidates,
  matchGameLogEntry,
  computeBoostSplit,
  applyLegDnp,
  gradeDfsBetFromGraded,
} from './grading';
export type {
  PlayerGameLogCategoriesShape,
  PlayerGameLogMlbExtrasShape,
  PlayerGameLogEntryShape,
  BetStatus,
  MidGameDnpDecision,
} from './grading';

// Stat-adapter registry + per-sport tables.
export {
  getStatAdapter,
  extractStatForPropViaRegistry,
} from './stat-adapters';
export type { StatAdapter, AdapterTable } from './stat-adapters';
export { BASKETBALL_ADAPTERS } from './stat-adapters/basketball';
export { NFL_ADAPTERS } from './stat-adapters/nfl';
export { MLB_ADAPTERS } from './stat-adapters/mlb';
export { NHL_ADAPTERS } from './stat-adapters/nhl';

// Reconciliation windows — per-league stat-correction TTLs.
export {
  RECONCILIATION_WINDOW_MS,
  SUPPORTED_RECONCILIATION_LEAGUES,
  MAX_RECONCILIATION_WINDOW_MS,
  isWithinReconciliationWindow,
} from './reconciliation-windows';

// Live-update helpers — diff-guarded actual-value writes + alert titles.
export {
  shouldWriteLiveActual,
  buildLiveSnapshot,
  buildLiveLegAlertTitle,
} from './live-helpers';

// Boxscore → PlayerGameLogEntryShape adapter (NHL Hits/Blocked Shots).
export {
  boxScorePlayerToGameLogShape,
  findAndConvertBoxScorePlayer,
} from './boxscore-shape';
export type { BoxScorePlayer, BoxScoreTeam } from './boxscore-shape';
