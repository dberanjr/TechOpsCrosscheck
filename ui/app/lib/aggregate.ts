import type { PerCiRow } from "../components/PerCiTable";
import type { TechOpsRow } from "./parseTechOpsCsv";
import { CANONICAL_TIERS } from "./parseTechOpsCsv";
import { pctChange } from "./percentChange";

interface RawDqlRecord {
  [key: string]: unknown;
}

// Grail DQL serializes `long` results (e.g. countDistinct) as JSON strings to
// preserve precision past 2^53; doubles come through as numbers; `null` stays
// `null`. Coerce all three shapes here.
function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }
  if (typeof value === "bigint") return Number(value);
  return null;
}

function toNumOrNull(value: unknown): number | null {
  return coerceNumber(value);
}

function toNum(value: unknown): number {
  return coerceNumber(value) ?? 0;
}

function toStr(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toStrOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Convert raw DQL records from perCiRollupQuery to PerCiRow[] enriched with
 * Tier / Director / ApplicationName from the active applicationList.
 *
 * Pass `effectiveCis` (lowercase) to zero-pad: CIs in the effective set that
 * produced no problems will appear in the output with zero counts rather than
 * being silently absent. This ensures data for ALL CIs is surfaced, not just
 * those that had problems in the analysis window. */
export function recordsToPerCiRows(
  records: ReadonlyArray<unknown> | undefined | null,
  applicationList: ReadonlyArray<TechOpsRow>,
  effectiveCis?: ReadonlyArray<string>,
): PerCiRow[] {
  const lookup = new Map<string, TechOpsRow>();
  for (const r of applicationList) {
    lookup.set(r.AppCI.toLowerCase(), r);
  }

  const rows: PerCiRow[] = [];

  if (records) {
    for (const raw of records) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as RawDqlRecord;
      const singleAppCI = toStr(r.singleAppCI);
      if (!singleAppCI) continue;
      const enrich = lookup.get(singleAppCI.toLowerCase());
      rows.push({
        singleAppCI,
        ApplicationName: enrich?.ApplicationName ?? null,
        ciname: toStrOrNull(r.ciname),
        Tier: enrich?.Tier ?? null,
        Director: enrich?.Director ?? null,
        preMTTR_ns: toNumOrNull(r.preMTTR_ns),
        postMTTR_ns: toNumOrNull(r.postMTTR_ns),
        preCount: toNum(r.preCount),
        postCount: toNum(r.postCount),
        preAvgImpact: toNumOrNull(r.preAvgImpact),
        postAvgImpact: toNumOrNull(r.postAvgImpact),
        mttrPctChange: toNumOrNull(r.mttrPctChange),
        countPctChange: toNumOrNull(r.countPctChange),
        avgImpactPctChange: toNumOrNull(r.avgImpactPctChange),
      });
    }
  }

  // Zero-pad: add rows for CIs in the effective set that had no matching
  // problems so they appear with zero counts instead of being absent.
  if (effectiveCis && effectiveCis.length > 0) {
    const resultCiSet = new Set(rows.map((r) => r.singleAppCI.toLowerCase()));
    for (const ciLower of effectiveCis) {
      if (resultCiSet.has(ciLower)) continue;
      const app = lookup.get(ciLower);
      rows.push({
        singleAppCI: ciLower.toUpperCase(),
        ApplicationName: app?.ApplicationName || null,
        ciname: null,
        Tier: app?.Tier ?? null,
        Director: app?.Director || null,
        preMTTR_ns: null,
        postMTTR_ns: null,
        preCount: 0,
        postCount: 0,
        preAvgImpact: null,
        postAvgImpact: null,
        mttrPctChange: null,
        countPctChange: null,
        avgImpactPctChange: null,
      });
    }
  }

  return rows;
}

export interface HeadlineMetrics {
  preImpact: number;
  postImpact: number;
  preCount: number;
  postCount: number;
  preWeightedMttrNs: number | null;
  postWeightedMttrNs: number | null;
  improvedCount: number;
  regressedCount: number;
  newCount: number;
}

const NEW = 9999;

function rowVerdict(row: PerCiRow): "improved" | "regressed" | "new" | "stable" {
  const candidates = [row.mttrPctChange, row.countPctChange, row.avgImpactPctChange];
  if (candidates.some((v) => v === NEW)) return "new";
  const primary = row.avgImpactPctChange ?? row.countPctChange ?? row.mttrPctChange;
  if (primary === null || primary === undefined || Number.isNaN(primary)) return "stable";
  if (primary > 0.01) return "regressed";
  if (primary < -0.01) return "improved";
  return "stable";
}

export function aggregateHeadlines(rows: ReadonlyArray<PerCiRow>): HeadlineMetrics {
  let preImpact = 0;
  let postImpact = 0;
  let preCount = 0;
  let postCount = 0;
  let preMttrSum = 0;
  let preMttrWeight = 0;
  let postMttrSum = 0;
  let postMttrWeight = 0;
  let improvedCount = 0;
  let regressedCount = 0;
  let newCount = 0;

  for (const r of rows) {
    if (r.preAvgImpact !== null) preImpact += r.preAvgImpact;
    if (r.postAvgImpact !== null) postImpact += r.postAvgImpact;
    preCount += r.preCount;
    postCount += r.postCount;
    if (r.preMTTR_ns !== null && r.preCount > 0) {
      preMttrSum += r.preMTTR_ns * r.preCount;
      preMttrWeight += r.preCount;
    }
    if (r.postMTTR_ns !== null && r.postCount > 0) {
      postMttrSum += r.postMTTR_ns * r.postCount;
      postMttrWeight += r.postCount;
    }
    const verdict = rowVerdict(r);
    if (verdict === "improved") improvedCount++;
    else if (verdict === "regressed") regressedCount++;
    else if (verdict === "new") newCount++;
  }

  return {
    preImpact,
    postImpact,
    preCount,
    postCount,
    preWeightedMttrNs: preMttrWeight > 0 ? preMttrSum / preMttrWeight : null,
    postWeightedMttrNs: postMttrWeight > 0 ? postMttrSum / postMttrWeight : null,
    improvedCount,
    regressedCount,
    newCount,
  };
}

export interface TierRollup {
  tier: string;
  ciCount: number;
  mttrPct: number | null;
  countPct: number | null;
  impactPct: number | null;
  preMttr: number | null;
  postMttr: number | null;
  preCount: number;
  postCount: number;
  preImpact: number;
  postImpact: number;
}

export function aggregateTiers(rows: ReadonlyArray<PerCiRow>): TierRollup[] {
  return CANONICAL_TIERS.map((tier) => {
    const tierRows = rows.filter((r) => r.Tier === tier);
    if (tierRows.length === 0) {
      return { tier, ciCount: 0, mttrPct: null, countPct: null, impactPct: null, preMttr: null, postMttr: null, preCount: 0, postCount: 0, preImpact: 0, postImpact: 0 };
    }
    let preMttrSum = 0;
    let preMttrWeight = 0;
    let postMttrSum = 0;
    let postMttrWeight = 0;
    let preCount = 0;
    let postCount = 0;
    let preImpact = 0;
    let postImpact = 0;
    for (const r of tierRows) {
      if (r.preMTTR_ns !== null && r.preCount > 0) {
        preMttrSum += r.preMTTR_ns * r.preCount;
        preMttrWeight += r.preCount;
      }
      if (r.postMTTR_ns !== null && r.postCount > 0) {
        postMttrSum += r.postMTTR_ns * r.postCount;
        postMttrWeight += r.postCount;
      }
      preCount += r.preCount;
      postCount += r.postCount;
      if (r.preAvgImpact !== null) preImpact += r.preAvgImpact;
      if (r.postAvgImpact !== null) postImpact += r.postAvgImpact;
    }
    const preMttr = preMttrWeight > 0 ? preMttrSum / preMttrWeight : null;
    const postMttr = postMttrWeight > 0 ? postMttrSum / postMttrWeight : null;
    return {
      tier,
      ciCount: tierRows.length,
      mttrPct: pctChange(preMttr, postMttr),
      countPct: pctChange(preCount, postCount),
      impactPct: pctChange(preImpact, postImpact),
      preMttr,
      postMttr,
      preCount,
      postCount,
      preImpact,
      postImpact,
    };
  });
}

export interface DailySeries {
  count: ReadonlyArray<number>;
  mttrNs: ReadonlyArray<number>;
  impact: ReadonlyArray<number>;
  pivotIndex: number;
}

/** Extract three numeric series from the dailyTimeseries query result.
 * makeTimeseries with multiple aggregations and no `by:` returns a single
 * record whose aggregate fields are arrays. */
export function extractDailySeries(
  records: ReadonlyArray<unknown> | undefined | null,
  windowDays: number,
): DailySeries | null {
  if (!records || records.length === 0) return null;
  const rec = records[0];
  if (!rec || typeof rec !== "object") return null;
  const r = rec as RawDqlRecord;
  const count = arrayOfNumbers(r.count);
  const mttrNs = arrayOfNumbers(r.mttr_ns);
  const impact = arrayOfNumbers(r.impact);
  if (count.length === 0 && mttrNs.length === 0 && impact.length === 0) return null;
  return {
    count,
    mttrNs,
    impact,
    pivotIndex: windowDays,
  };
}

function arrayOfNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => coerceNumber(v) ?? 0);
}

/** Resolve the effective AppCI list to constrain DQL queries. Filters
 * applicationList by tier/director/explicit AppCI selection. */
export function effectiveAppCis(
  applicationList: ReadonlyArray<TechOpsRow>,
  tierFilter: ReadonlyArray<string>,
  directorFilter: ReadonlyArray<string>,
  appCiFilter: ReadonlyArray<string>,
): string[] {
  const tierSet = new Set(tierFilter);
  const directorSet = new Set(directorFilter);
  const ciSet = new Set(appCiFilter.map((s) => s.toLowerCase()));
  const out: string[] = [];
  for (const r of applicationList) {
    const lower = r.AppCI.toLowerCase();
    if (tierSet.size > 0 && !tierSet.has(r.Tier)) continue;
    if (directorSet.size > 0 && !directorSet.has(r.Director)) continue;
    if (ciSet.size > 0 && !ciSet.has(lower)) continue;
    out.push(lower);
  }
  return out;
}
