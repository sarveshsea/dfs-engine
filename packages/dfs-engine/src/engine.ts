import {
  computeBoostSplit,
  gradeDfsBetFromGraded,
  gradeLegFromActual,
  findGameLogCandidates,
} from './grading';
import type { BetStatus, PlayerGameLogEntryShape } from './grading';
import {
  lookupBaseMultiplier,
  lookupStandardMultiplier,
  recalcMultiplierAfterDnp,
} from './payouts';
import { asDfsPropTypeKey, normalizeDfsPropType } from './prop-normalizer';
import type { DfsPropTypeKey } from './prop-normalizer';
import { BASKETBALL_ADAPTERS } from './stat-adapters/basketball';
import { MLB_ADAPTERS } from './stat-adapters/mlb';
import { NFL_ADAPTERS } from './stat-adapters/nfl';
import { NHL_ADAPTERS } from './stat-adapters/nhl';
import { SOCCER_ADAPTERS } from './stat-adapters/soccer';
import type { AdapterTable, StatAdapterOptions } from './stat-adapters';
import type {
  CreateDfsBetInput,
  DfsApp,
  DfsBetLeg,
  DfsLegStatus,
  DfsPayoutSplit,
  DfsPlayType,
} from './types';

export type DfsStatProviderSource =
  | 'context.actuals'
  | 'context.entry'
  | 'entry.actualValue'
  | 'stat-provider';

export type DfsProvenance = {
  source: DfsStatProviderSource;
  providerId: string | null;
  detail: string | null;
};

export type DfsLegInput = {
  legId: string;
  playerName: string;
  playerId?: string | null;
  league: string;
  propType: string;
  line: number;
  direction: 'over' | 'under';
  gameId?: string | null;
  gameDate?: string | null;
  actualValue?: number | null;
  legStatus?: DfsLegStatus;
  boostType?: string | null;
};

export type DfsEntryInput = {
  entryId?: string;
  app: DfsApp;
  playType: DfsPlayType;
  stake: number;
  displayedMultiplier: number;
  baseMultiplier?: number | null;
  profitBoostPct?: number | null;
  placedAt?: string | null;
  legs: DfsLegInput[];
};

export type DfsSettlementContext = {
  actualsByLegId?: Record<string, number | null | undefined>;
  actualEntry?: PlayerGameLogEntryShape;
  statProviderId?: string;
  now?: Date | string | number;
  auditRunId?: string;
  statAdapterOptions?: StatAdapterOptions;
  metadata?: Record<string, unknown>;
};

export type DfsLegStatFailureReason =
  | 'unknown_prop'
  | 'unsupported_league'
  | 'prop_not_supported_for_league'
  | 'adapter_returned_null'
  | 'stats_missing'
  | 'ambiguous_game'
  | 'provider_not_found'
  | 'provider_failed';

export type DfsLegStatResult =
  | {
      ok: true;
      value: number;
      normalizedPropType: DfsPropTypeKey;
      provenance: DfsProvenance;
    }
  | {
      ok: false;
      reason: DfsLegStatFailureReason;
      detail: string;
      normalizedPropType: string | null;
      provenance?: DfsProvenance;
    };

export type DfsLegDecision = {
  legId: string;
  status: DfsLegStatus;
  line: number;
  direction: 'over' | 'under';
  actual: number | null;
  propType: string;
  normalizedPropType: string;
  pendingReason: DfsLegStatFailureReason | null;
  provenance: DfsProvenance | null;
};

export type DfsSettlementAdjustment =
  | {
      type: 'dnp';
      legIds: string[];
      reason: 'leg_marked_dnp';
    }
  | {
      type: 'push';
      legIds: string[];
      reason: 'leg_pushed';
    }
  | {
      type: 'void';
      legIds: string[];
      reason: 'all_legs_removed';
    }
  | {
      type: 'reprice';
      legIds: string[];
      reason: 'removed_legs';
      multiplier: number;
      usedFallback: boolean;
    };

export type DfsAuditEventType =
  | 'entry.normalized'
  | 'leg.actual.resolved'
  | 'leg.actual.pending'
  | 'leg.graded'
  | 'entry.adjusted'
  | 'entry.settled';

export type DfsAuditEvent = {
  type: DfsAuditEventType;
  at: string;
  entryId: string | null;
  legId?: string;
  detail: string;
  runId: string | null;
};

export type DfsSettlementResult = {
  entryId: string | null;
  app: DfsApp;
  playType: DfsPlayType;
  status: BetStatus;
  effectiveMultiplier: number;
  payout: DfsPayoutSplit;
  legs: DfsLegDecision[];
  adjustments: DfsSettlementAdjustment[];
  audit: DfsAuditEvent[];
};

export type DfsLeagueAdapterDefinition = {
  league: string;
  aliases?: readonly string[];
  adapters: AdapterTable;
};

export type DfsBookPolicy = {
  app: DfsApp;
  version: string;
  effectiveFrom: string;
  sourceNotes: readonly string[];
  dnp: {
    removeLeg: boolean;
    voidIfNoSurvivors: boolean;
  };
  push: {
    removeLeg: boolean;
    refundIfNoSurvivors: boolean;
  };
};

export type DfsPayoutTableDefinition = {
  app: DfsApp;
  playType: DfsPlayType;
  effectiveFrom: string;
  sourceNotes?: readonly string[];
  entries: ReadonlyArray<{
    pickCount: number;
    hits: number;
    multiplier: number;
  }>;
};

export type StatProviderGameLogInput = {
  leg: DfsLegInput;
  entry: DfsEntryInput;
  context: DfsSettlementContext;
};

export type StatProviderActualInput = StatProviderGameLogInput & {
  normalizedPropType: DfsPropTypeKey;
};

export type StatProvider = {
  id: string;
  getActual?: (input: StatProviderActualInput) => number | null | Promise<number | null>;
  getGameLog?: (
    input: StatProviderGameLogInput,
  ) => PlayerGameLogEntryShape[] | Promise<PlayerGameLogEntryShape[]>;
};

export type GameProvider = {
  id: string;
};

export type PlayerResolver = {
  id: string;
};

export type SettlementStore = {
  id: string;
};

export type DfsEngineConfig = {
  leagues?: readonly DfsLeagueAdapterDefinition[];
  bookPolicies?: readonly DfsBookPolicy[];
  payoutTables?: readonly DfsPayoutTableDefinition[];
  statProviders?: readonly StatProvider[];
  gameProviders?: readonly GameProvider[];
  playerResolvers?: readonly PlayerResolver[];
  settlementStores?: readonly SettlementStore[];
  clock?: () => Date;
  auditMetadata?: Record<string, unknown>;
};

export type DfsEngine = {
  normalizeEntry(input: DfsEntryInput): DfsEntryInput;
  extractLegStat(
    leg: DfsLegInput,
    entry: DfsEntryInput,
    context?: DfsSettlementContext,
  ): Promise<DfsLegStatResult>;
  gradeLeg(
    leg: DfsLegInput,
    actual: number | null,
    provenance?: DfsProvenance | null,
  ): DfsLegDecision;
  settleEntry(input: DfsEntryInput, context?: DfsSettlementContext): Promise<DfsSettlementResult>;
  explainSettlement(result: DfsSettlementResult): string;
  registerLeague(adapter: DfsLeagueAdapterDefinition): void;
  getRegisteredLeagues(): readonly string[];
  registerStatProvider(provider: StatProvider): void;
};

export function defineLeagueAdapter(
  adapter: DfsLeagueAdapterDefinition,
): DfsLeagueAdapterDefinition {
  if (!adapter.league.trim()) throw new Error('defineLeagueAdapter: league must be non-empty');
  return adapter;
}

export function defineBookPolicy(policy: DfsBookPolicy): DfsBookPolicy {
  if (!policy.app) throw new Error('defineBookPolicy: app is required');
  if (!policy.version.trim()) throw new Error('defineBookPolicy: version must be non-empty');
  return policy;
}

export function definePayoutTable(table: DfsPayoutTableDefinition): DfsPayoutTableDefinition {
  if (table.entries.length === 0) throw new Error('definePayoutTable: entries must be non-empty');
  return table;
}

export function defineStatProvider(provider: StatProvider): StatProvider {
  if (!provider.id.trim()) throw new Error('defineStatProvider: id must be non-empty');
  if (!provider.getActual && !provider.getGameLog) {
    throw new Error('defineStatProvider: provide getActual or getGameLog');
  }
  return provider;
}

const DEFAULT_BOOK_POLICIES: DfsBookPolicy[] = [
  {
    app: 'prizepicks',
    version: '2026-05',
    effectiveFrom: '2026-05-01',
    sourceNotes: ['Default v2 policy profile extracted from the v1 payout and DNP behavior.'],
    dnp: { removeLeg: true, voidIfNoSurvivors: true },
    push: { removeLeg: true, refundIfNoSurvivors: true },
  },
  {
    app: 'underdog',
    version: '2026-05',
    effectiveFrom: '2026-05-01',
    sourceNotes: [
      'Default v2 policy profile; provider-specific rescued-pick inputs are modeled as DNP removals.',
    ],
    dnp: { removeLeg: true, voidIfNoSurvivors: true },
    push: { removeLeg: true, refundIfNoSurvivors: true },
  },
];

const DEFAULT_LEAGUES: DfsLeagueAdapterDefinition[] = [
  { league: 'NBA', adapters: BASKETBALL_ADAPTERS },
  { league: 'WNBA', adapters: BASKETBALL_ADAPTERS },
  { league: 'NCAAM', adapters: BASKETBALL_ADAPTERS },
  { league: 'NCAAW', adapters: BASKETBALL_ADAPTERS },
  { league: 'NFL', adapters: NFL_ADAPTERS },
  { league: 'MLB', adapters: MLB_ADAPTERS },
  { league: 'NHL', adapters: NHL_ADAPTERS },
  { league: 'EPL', adapters: SOCCER_ADAPTERS },
  { league: 'MLS', adapters: SOCCER_ADAPTERS },
  { league: 'LALIGA', adapters: SOCCER_ADAPTERS },
  { league: 'NWSL', adapters: SOCCER_ADAPTERS },
  { league: 'UCL', adapters: SOCCER_ADAPTERS },
];

export function createDfsEngine(config: DfsEngineConfig = {}): DfsEngine {
  const leagues = new Map<string, AdapterTable>();
  const policies = new Map<DfsApp, DfsBookPolicy>();
  const payoutTables = [...(config.payoutTables ?? [])];
  const statProviders = new Map<string, StatProvider>();
  const clock = config.clock ?? (() => new Date());

  const registerLeague = (adapter: DfsLeagueAdapterDefinition): void => {
    const normalized = adapter.league.toUpperCase();
    leagues.set(normalized, adapter.adapters);
    for (const alias of adapter.aliases ?? []) {
      leagues.set(alias.toUpperCase(), adapter.adapters);
    }
  };

  for (const adapter of DEFAULT_LEAGUES) registerLeague(adapter);
  for (const adapter of config.leagues ?? []) registerLeague(defineLeagueAdapter(adapter));
  for (const policy of DEFAULT_BOOK_POLICIES) policies.set(policy.app, policy);
  for (const policy of config.bookPolicies ?? [])
    policies.set(policy.app, defineBookPolicy(policy));
  for (const provider of config.statProviders ?? [])
    statProviders.set(provider.id, defineStatProvider(provider));

  const nowIso = (context?: DfsSettlementContext): string => {
    const value = context?.now ?? clock();
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : clock().toISOString();
  };

  const audit = (
    events: DfsAuditEvent[],
    type: DfsAuditEventType,
    entryId: string | null,
    detail: string,
    context?: DfsSettlementContext,
    legId?: string,
  ): void => {
    events.push({
      type,
      at: nowIso(context),
      entryId,
      legId,
      detail,
      runId: context?.auditRunId ?? null,
    });
  };

  const lookupConfiguredMultiplier = (opts: {
    app: DfsApp;
    playType: DfsPlayType;
    pickCount: number;
    hits: number;
  }): number | null => {
    for (let i = payoutTables.length - 1; i >= 0; i -= 1) {
      const table = payoutTables[i];
      if (table?.app !== opts.app || table.playType !== opts.playType) continue;
      const entry = table.entries.find(
        (row) => row.pickCount === opts.pickCount && row.hits === opts.hits,
      );
      if (entry) return entry.multiplier;
    }
    return lookupStandardMultiplier(opts);
  };

  const normalizeEntry = (input: DfsEntryInput): DfsEntryInput => {
    const baseMultiplier =
      input.baseMultiplier ??
      lookupBaseMultiplier({
        app: input.app,
        playType: input.playType,
        pickCount:
          input.legs.filter((candidate) => candidate.legStatus !== 'dnp').length ||
          input.legs.length,
      });
    return {
      ...input,
      baseMultiplier,
      profitBoostPct: input.profitBoostPct ?? null,
      placedAt: input.placedAt ?? null,
      legs: input.legs.map((inputLeg) => ({
        ...inputLeg,
        propType: normalizeDfsPropType(inputLeg.propType),
        playerId: inputLeg.playerId ?? null,
        gameId: inputLeg.gameId ?? null,
        gameDate: inputLeg.gameDate ?? null,
        actualValue: inputLeg.actualValue ?? null,
        legStatus: inputLeg.legStatus ?? 'pending',
      })),
    };
  };

  const runAdapter = (
    leg: DfsLegInput,
    actualEntry: PlayerGameLogEntryShape,
    app: DfsApp,
    provenance: DfsProvenance,
    opts?: StatAdapterOptions,
  ): DfsLegStatResult => {
    const key = asDfsPropTypeKey(leg.propType);
    if (!key) {
      return {
        ok: false,
        reason: 'unknown_prop',
        detail: `propType=${JSON.stringify(leg.propType)} not in DfsPropTypeKey or alias table`,
        normalizedPropType: null,
        provenance,
      };
    }
    const table = leagues.get(leg.league.toUpperCase());
    if (!table) {
      return {
        ok: false,
        reason: 'unsupported_league',
        detail: `league=${JSON.stringify(leg.league)} not registered`,
        normalizedPropType: key,
        provenance,
      };
    }
    const adapter = table[key];
    if (!adapter) {
      return {
        ok: false,
        reason: 'prop_not_supported_for_league',
        detail: `prop=${key} has no adapter for league=${leg.league.toUpperCase()}`,
        normalizedPropType: key,
        provenance,
      };
    }
    const value = adapter(actualEntry, app, opts);
    if (value == null || !Number.isFinite(value)) {
      return {
        ok: false,
        reason: 'adapter_returned_null',
        detail: `prop=${key} league=${leg.league.toUpperCase()} adapter returned ${String(value)}`,
        normalizedPropType: key,
        provenance,
      };
    }
    return {
      ok: true,
      value,
      normalizedPropType: key,
      provenance,
    };
  };

  const extractFromProvider = async (
    provider: StatProvider,
    leg: DfsLegInput,
    entry: DfsEntryInput,
    context: DfsSettlementContext,
    normalizedPropType: DfsPropTypeKey,
  ): Promise<DfsLegStatResult> => {
    const provenance: DfsProvenance = {
      source: 'stat-provider',
      providerId: provider.id,
      detail: null,
    };
    try {
      if (provider.getActual) {
        const value = await provider.getActual({ leg, entry, context, normalizedPropType });
        if (value != null && Number.isFinite(value)) {
          return { ok: true, value, normalizedPropType, provenance };
        }
      }
      if (!provider.getGameLog) {
        return {
          ok: false,
          reason: 'stats_missing',
          detail: `provider=${provider.id} did not return an actual value`,
          normalizedPropType,
          provenance,
        };
      }
      const entries = await provider.getGameLog({ leg, entry, context });
      const candidates = findGameLogCandidates(leg.gameDate ?? entry.placedAt ?? null, entries);
      if (candidates.length === 0) {
        return {
          ok: false,
          reason: 'stats_missing',
          detail: `provider=${provider.id} returned no gamelog entry for leg=${leg.legId}`,
          normalizedPropType,
          provenance,
        };
      }
      if (candidates.length > 1) {
        return {
          ok: false,
          reason: 'ambiguous_game',
          detail: `provider=${provider.id} returned ${candidates.length} plausible gamelog entries`,
          normalizedPropType,
          provenance,
        };
      }
      return runAdapter(leg, candidates[0]!, entry.app, provenance, context.statAdapterOptions);
    } catch (error) {
      return {
        ok: false,
        reason: 'provider_failed',
        detail: error instanceof Error ? error.message : String(error),
        normalizedPropType,
        provenance,
      };
    }
  };

  const extractLegStat = async (
    rawLeg: DfsLegInput,
    rawEntry: DfsEntryInput,
    context: DfsSettlementContext = {},
  ): Promise<DfsLegStatResult> => {
    const entry = normalizeEntry(rawEntry);
    const leg = normalizeEntry({ ...entry, legs: [rawLeg] }).legs[0]!;
    const key = asDfsPropTypeKey(leg.propType);
    const hasContextActual = Object.prototype.hasOwnProperty.call(
      context.actualsByLegId ?? {},
      leg.legId,
    );

    if (hasContextActual) {
      const value = context.actualsByLegId?.[leg.legId];
      if (value != null && Number.isFinite(value) && key) {
        return {
          ok: true,
          value,
          normalizedPropType: key,
          provenance: { source: 'context.actuals', providerId: null, detail: null },
        };
      }
      return {
        ok: false,
        reason: 'stats_missing',
        detail: `context actual for leg=${leg.legId} is ${String(value)}`,
        normalizedPropType: key,
        provenance: { source: 'context.actuals', providerId: null, detail: null },
      };
    }

    if (context.actualEntry) {
      return runAdapter(
        leg,
        context.actualEntry,
        entry.app,
        { source: 'context.entry', providerId: null, detail: null },
        context.statAdapterOptions,
      );
    }

    if (leg.actualValue != null && Number.isFinite(leg.actualValue) && key) {
      return {
        ok: true,
        value: leg.actualValue,
        normalizedPropType: key,
        provenance: { source: 'entry.actualValue', providerId: null, detail: null },
      };
    }

    if (!key) {
      return {
        ok: false,
        reason: 'unknown_prop',
        detail: `propType=${JSON.stringify(leg.propType)} not in DfsPropTypeKey or alias table`,
        normalizedPropType: null,
      };
    }

    const provider =
      context.statProviderId != null
        ? statProviders.get(context.statProviderId)
        : (Array.from(statProviders.values())[0] ?? null);
    if (!provider) {
      return {
        ok: false,
        reason: context.statProviderId ? 'provider_not_found' : 'stats_missing',
        detail: context.statProviderId
          ? `statProviderId=${context.statProviderId} not registered`
          : `no actual value or stat provider available for leg=${leg.legId}`,
        normalizedPropType: key,
      };
    }
    return extractFromProvider(provider, leg, entry, context, key);
  };

  const gradeLeg = (
    inputLeg: DfsLegInput,
    actual: number | null,
    provenance: DfsProvenance | null = null,
  ): DfsLegDecision => {
    const normalizedPropType = normalizeDfsPropType(inputLeg.propType);
    const status = gradeLegFromActual(inputLeg.line, inputLeg.direction, actual);
    return {
      legId: inputLeg.legId,
      status,
      line: inputLeg.line,
      direction: inputLeg.direction,
      actual,
      propType: inputLeg.propType,
      normalizedPropType,
      pendingReason: status === 'pending' ? 'stats_missing' : null,
      provenance,
    };
  };

  const settleEntry = async (
    input: DfsEntryInput,
    context: DfsSettlementContext = {},
  ): Promise<DfsSettlementResult> => {
    const normalized = normalizeEntry(input);
    const events: DfsAuditEvent[] = [];
    audit(
      events,
      'entry.normalized',
      normalized.entryId ?? null,
      `${normalized.legs.length} legs normalized`,
      context,
    );

    const decisions: DfsLegDecision[] = [];
    const adjustments: DfsSettlementAdjustment[] = [];

    for (const currentLeg of normalized.legs) {
      if (currentLeg.legStatus === 'dnp') {
        decisions.push({
          legId: currentLeg.legId,
          status: 'dnp',
          line: currentLeg.line,
          direction: currentLeg.direction,
          actual: null,
          propType: currentLeg.propType,
          normalizedPropType: currentLeg.propType,
          pendingReason: null,
          provenance: null,
        });
        adjustments.push({ type: 'dnp', legIds: [currentLeg.legId], reason: 'leg_marked_dnp' });
        audit(
          events,
          'entry.adjusted',
          normalized.entryId ?? null,
          'leg removed as DNP',
          context,
          currentLeg.legId,
        );
        continue;
      }

      const stat = await extractLegStat(currentLeg, normalized, context);
      if (!stat.ok) {
        decisions.push({
          legId: currentLeg.legId,
          status: 'pending',
          line: currentLeg.line,
          direction: currentLeg.direction,
          actual: null,
          propType: currentLeg.propType,
          normalizedPropType: stat.normalizedPropType ?? currentLeg.propType,
          pendingReason: stat.reason,
          provenance: stat.provenance ?? null,
        });
        audit(
          events,
          'leg.actual.pending',
          normalized.entryId ?? null,
          stat.detail,
          context,
          currentLeg.legId,
        );
        continue;
      }

      audit(
        events,
        'leg.actual.resolved',
        normalized.entryId ?? null,
        `${currentLeg.propType}=${stat.value}`,
        context,
        currentLeg.legId,
      );
      const decision = gradeLeg(currentLeg, stat.value, stat.provenance);
      decisions.push(decision);
      audit(
        events,
        'leg.graded',
        normalized.entryId ?? null,
        decision.status,
        context,
        currentLeg.legId,
      );
    }

    const removedLegIds = decisions
      .filter((decision) => decision.status === 'dnp' || decision.status === 'push')
      .map((decision) => decision.legId);
    for (const pushed of decisions.filter((decision) => decision.status === 'push')) {
      adjustments.push({ type: 'push', legIds: [pushed.legId], reason: 'leg_pushed' });
    }

    const surviving = decisions.filter(
      (decision) => decision.status !== 'dnp' && decision.status !== 'push',
    );
    if (surviving.length === 0) {
      const status: BetStatus = decisions.some((decision) => decision.status === 'dnp')
        ? 'void'
        : 'pushed';
      adjustments.push({ type: 'void', legIds: removedLegIds, reason: 'all_legs_removed' });
      const payout = { total: normalized.stake, withdrawable: normalized.stake, bonus: 0 };
      audit(events, 'entry.settled', normalized.entryId ?? null, status, context);
      return {
        entryId: normalized.entryId ?? null,
        app: normalized.app,
        playType: normalized.playType,
        status,
        effectiveMultiplier: 0,
        payout,
        legs: decisions,
        adjustments,
        audit: events,
      };
    }

    if (surviving.some((decision) => decision.status === 'pending')) {
      audit(events, 'entry.settled', normalized.entryId ?? null, 'pending', context);
      return {
        entryId: normalized.entryId ?? null,
        app: normalized.app,
        playType: normalized.playType,
        status: 'pending',
        effectiveMultiplier: normalized.displayedMultiplier,
        payout: { total: 0, withdrawable: 0, bonus: 0 },
        legs: decisions,
        adjustments,
        audit: events,
      };
    }

    let displayedMultiplier = normalized.displayedMultiplier;
    if (removedLegIds.length > 0) {
      const reprice = recalcMultiplierAfterDnp({
        app: normalized.app,
        playType: normalized.playType,
        originalPickCount: normalized.legs.length,
        survivingPickCount: surviving.length,
        survivingHits: surviving.filter((decision) => decision.status === 'won').length,
        originalMultiplier: normalized.displayedMultiplier,
      });
      displayedMultiplier = reprice.newMultiplier;
      adjustments.push({
        type: 'reprice',
        legIds: removedLegIds,
        reason: 'removed_legs',
        multiplier: reprice.newMultiplier,
        usedFallback: reprice.usedFallback,
      });
    }

    const legacyLegs = surviving.map((decision) => decisionToLegacyLeg(normalized.legs, decision));
    const wonCount = surviving.filter((decision) => decision.status === 'won').length;
    const isFlex = normalized.playType === 'flex' || normalized.playType === 'underdog_flex';
    const graded = gradeDfsBetFromGraded({
      app: normalized.app,
      playType: normalized.playType,
      legs: legacyLegs,
      stake: normalized.stake,
      displayedMultiplier,
      baseMultiplier:
        normalized.baseMultiplier ??
        lookupConfiguredMultiplier({
          app: normalized.app,
          playType: normalized.playType,
          pickCount: surviving.length,
          hits: surviving.length,
        }),
      profitBoostPct: normalized.profitBoostPct ?? null,
    });
    const baseForSplit = isFlex
      ? lookupConfiguredMultiplier({
          app: normalized.app,
          playType: normalized.playType,
          pickCount: surviving.length,
          hits: wonCount,
        })
      : normalized.baseMultiplier;
    const split = computeBoostSplit({
      app: normalized.app,
      totalPayout: graded.totalPayout,
      stake: normalized.stake,
      multiplier: graded.effectiveMultiplier,
      baseMultiplier: baseForSplit ?? null,
      profitBoostPct: normalized.profitBoostPct ?? null,
    });

    audit(events, 'entry.settled', normalized.entryId ?? null, graded.status, context);
    return {
      entryId: normalized.entryId ?? null,
      app: normalized.app,
      playType: normalized.playType,
      status: graded.status,
      effectiveMultiplier: graded.effectiveMultiplier,
      payout: {
        total: split.total,
        withdrawable: split.withdrawable,
        bonus: split.bonus,
      },
      legs: decisions,
      adjustments,
      audit: events,
    };
  };

  return {
    normalizeEntry,
    extractLegStat,
    gradeLeg,
    settleEntry,
    explainSettlement,
    registerLeague,
    getRegisteredLeagues: () => Array.from(leagues.keys()).sort(),
    registerStatProvider: (provider: StatProvider) => {
      statProviders.set(provider.id, defineStatProvider(provider));
    },
  };
}

function decisionToLegacyLeg(legs: DfsLegInput[], decision: DfsLegDecision): DfsBetLeg {
  const source = legs.find((leg) => leg.legId === decision.legId);
  return {
    legId: decision.legId,
    playerName: source?.playerName ?? '',
    playerTeam: null,
    playerPosition: null,
    playerNumber: null,
    playerAthleteId: source?.playerId ?? null,
    linkage: null,
    propType: decision.normalizedPropType,
    line: decision.line,
    direction: decision.direction,
    league: source?.league ?? '',
    gameContext: {
      raw: '',
      homeTeam: null,
      awayTeam: null,
      homeScore: null,
      awayScore: null,
      state: 'final',
      clock: null,
      startTime: null,
      gameId: source?.gameId ?? null,
      gameDate: source?.gameDate ?? null,
      gameStartTime: null,
      dayOfWeek: null,
      stateCode: null,
    },
    actualValue: decision.actual,
    legStatus: decision.status,
    boostType: 'standard',
    liveSnapshot: null,
    gradingSnapshot: null,
  };
}

function explainSettlement(result: DfsSettlementResult): string {
  const id = result.entryId ?? 'entry';
  const payout = formatUsd(result.payout.total);
  const legSummary = result.legs.map((leg) => `${leg.legId}:${leg.status}`).join(', ');
  const adjustmentSummary =
    result.adjustments.length > 0
      ? ` Adjustments: ${result.adjustments.map((adjustment) => adjustment.type).join(', ')}.`
      : '';
  return `${id} settled ${result.status} at ${result.effectiveMultiplier}x for ${payout}. Legs: ${legSummary}.${adjustmentSummary}`;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function adaptBuzzrBetInput(input: CreateDfsBetInput & { id?: string }): DfsEntryInput {
  return {
    entryId: input.id,
    app: input.app,
    playType: input.playType,
    stake: input.stakeAmount,
    displayedMultiplier: input.multiplier,
    baseMultiplier: input.baseMultiplier ?? null,
    profitBoostPct: input.profitBoostPct ?? null,
    placedAt: input.placedAt ?? null,
    legs: input.legs.map((leg) => ({
      legId: leg.legId,
      playerName: leg.playerName,
      playerId: leg.playerAthleteId,
      league: leg.league,
      propType: normalizeDfsPropType(leg.propType),
      line: leg.line,
      direction: leg.direction,
      gameId: leg.linkage?.gameId ?? leg.gameContext.gameId,
      gameDate: leg.linkage?.gameDate ?? leg.gameContext.gameDate,
      actualValue: leg.actualValue,
      legStatus: leg.legStatus,
      boostType: leg.boostType,
    })),
  };
}
