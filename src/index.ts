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
