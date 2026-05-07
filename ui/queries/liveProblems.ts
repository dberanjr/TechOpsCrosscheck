import {
  categoryFilterLine,
  dqlIn,
  dqlInFilterLine,
  dqlString,
  IMPACT_LEVELS,
  type ProblemScope,
} from "./dqlUtils";

export interface LiveProblemParams {
  appCiFilter: readonly string[];
  problemScope: ProblemScope;
}

export interface LiveProblemRow {
  displayId: string;
  eventId: string | null;
  singleAppCI: string;
  title: string;
  category: string;
  impactLevel: string | null;
  rootCause: string | null;
  problemStart: string;
  minLossDaily: number;
  maxLossDaily: number;
  // computed in JS
  durationMs: number;
  avgDailyLoss: number;
  revenueAtRisk: number;
}

export function liveActiveProblemsQuery(params: LiveProblemParams): string {
  const { appCiFilter, problemScope } = params;
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return `fetch dt.davis.problems, from: ${dqlString(from)}
| filter event.kind == "DAVIS_PROBLEM" and event.status == "ACTIVE" and dt.davis.is_duplicate == false
${categoryFilterLine(problemScope)}
| expand impactLevel = dt.davis.impact_level
| filter ${dqlIn("impactLevel", IMPACT_LEVELS)}
| dedup display_id, sort: { timestamp desc }
| fieldsAdd applicationci = arrayDistinct(iCollectArray(splitString(arrayRemoveNulls(iCollectArray(if(matchesPhrase(entity_tags[], "*applicationci*"), lower(entity_tags[]))))[], ":")[1]))
| fieldsAdd applicationci = arrayDistinct(iCollectArray(splitString(applicationci[], ",")[0]))
| filter isNotNull(applicationci) and applicationci[0] != "empty"
| expand singleAppCI = applicationci
${dqlInFilterLine("singleAppCI", appCiFilter)}
| lookup [
    fetch bizevents, from: -24h
    | filter event.type == "workflow.import.servicenow.appci.service_discovered"
    | dedup applicationci
    | fields applicationci = lower(applicationci), loss = u_1_day_total_financial_loss
    | filter isNotNull(loss)
    | parse loss, """ "$" LD:minStr " - $" LD:maxStr """
    | parse loss, """ "Over $" LD:minStr """, parsingPrerequisite: (isNotNull(loss) and isNull(maxStr))
    | fieldsAdd minLossDaily = if(contains(minStr, "K"), toLong(splitString(minStr, "K")[0]) * 1000,
                               else: if(contains(minStr, "M"), toLong(splitString(minStr, "M")[0]) * 1000000,
                               else: 0))
    | fieldsAdd maxLossDaily = if(isNull(maxStr), minLossDaily * 2,
                               else: if(contains(maxStr, "K"), toLong(splitString(maxStr, "K")[0]) * 1000,
                               else: if(contains(maxStr, "M"), toLong(splitString(maxStr, "M")[0]) * 1000000,
                               else: 0)))
    | fields applicationci, minLossDaily, maxLossDaily
  ], sourceField: singleAppCI, lookupField: applicationci, prefix: "loss."
| fields singleAppCI = upper(singleAppCI), category = event.category, title = event.title,
         rootCause = root_cause_entity_name, displayId = display_id, eventId = event.id,
         impactLevel = impactLevel, problemStart = timestamp,
         minLossDaily = coalesce(loss.minLossDaily, 0), maxLossDaily = coalesce(loss.maxLossDaily, 0)
| sort problemStart desc
| limit 2000`;
}

function coerceNum(v: unknown): number {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string") { const n = Number(v); return Number.isNaN(n) ? 0 : n; }
  return 0;
}

export function recordsToLiveProblems(
  records: ReadonlyArray<unknown> | undefined,
): LiveProblemRow[] {
  if (!records) return [];
  const now = Date.now();
  const seen = new Set<string>();
  const out: LiveProblemRow[] = [];
  for (const r of records) {
    if (!r || typeof r !== "object") continue;
    const rec = r as Record<string, unknown>;
    const displayId = String(rec.displayId ?? "");
    const singleAppCI = String(rec.singleAppCI ?? "");
    if (!displayId) continue;
    const key = `${displayId}::${singleAppCI}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const problemStart = typeof rec.problemStart === "string" ? rec.problemStart : "";
    const startMs = problemStart ? new Date(problemStart).getTime() : now;
    const durationMs = Math.max(0, now - startMs);
    const minLossDaily = coerceNum(rec.minLossDaily);
    const maxLossDaily = coerceNum(rec.maxLossDaily);
    const avgDailyLoss = (minLossDaily + maxLossDaily) / 2;
    const revenueAtRisk = avgDailyLoss * (durationMs / 86_400_000);
    out.push({
      displayId,
      eventId: typeof rec.eventId === "string" ? rec.eventId : null,
      singleAppCI,
      title: String(rec.title ?? ""),
      category: String(rec.category ?? "UNKNOWN"),
      impactLevel: typeof rec.impactLevel === "string" ? rec.impactLevel : null,
      rootCause: typeof rec.rootCause === "string" ? rec.rootCause : null,
      problemStart,
      minLossDaily,
      maxLossDaily,
      durationMs,
      avgDailyLoss,
      revenueAtRisk,
    });
  }
  return out;
}
