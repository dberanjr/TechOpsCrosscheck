import { dqlString, windowRange } from "./dqlUtils";

export interface MttrImpactCriticalParams {
  pivotIso: string;
  windowDays: number;
}

// MTTR impact: services where problems take longest to resolve in critical apps.
// High MTTR means when this service fails, critical apps stay broken longer.
// Identifies services where incident response is slow or root cause is hard to find.
export function mttrImpactCriticalQuery(params: MttrImpactCriticalParams): string {
  const { pivotIso, windowDays } = params;

  return `fetch dt.davis.problems, from: -7d
| filter event.kind == "DAVIS_PROBLEM" and dt.davis.is_duplicate == false and isNotNull(resolved_problem_duration)
| fieldsAdd tags_str = toString(entity_tags)
| filter matchesPhrase(tags_str, "applicationci:")
| parse tags_str, """LD 'applicationci:' LD:appci '"' LD"""
| filter isNotNull(appci) and appci != ""
| fieldsAdd appci = lower(appci)
| lookup [
    fetch bizevents, from: -24h
    | filter event.type == "workflow.import.servicenow.appci"
    | filter in(tier, {"1 - most critical", "2 - somewhat critical"})
    | fields applicationci = lower(applicationci), tier
    | dedup applicationci
  ], sourceField: appci, lookupField: applicationci, prefix: "t1t2."
| filter isNotNull(t1t2.applicationci)
| fieldsAdd root_service = lower(coalesce(toString(root_cause_service_id), "unknown"))
| filter root_service != "unknown"
| summarize
    avg_mttr_ns = avg(resolved_problem_duration),
    problem_count = count(),
    by: {service_id = root_service}
| fieldsAdd appci = upper(service_id)
| filter problem_count >= 1
| sort avg_mttr_ns desc
| limit 10`;
}

export interface MttrImpactCriticalRow {
  appci: string;
  avg_mttr_ns: number | null;
  problem_count: number;
}

export function recordsToMttrImpactCritical(records: ReadonlyArray<unknown> | undefined | null): MttrImpactCriticalRow[] {
  if (!records) return [];
  const rows: MttrImpactCriticalRow[] = [];
  for (const raw of records) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const appci = typeof r.appci === "string" ? r.appci : "";
    if (!appci || appci === "UNKNOWN") continue;
    const avg_mttr_ns = typeof r.avg_mttr_ns === "number" ? r.avg_mttr_ns : (r.avg_mttr_ns == null ? null : Number(r.avg_mttr_ns) || null);
    const problem_count = typeof r.problem_count === "number" ? r.problem_count : Number(r.problem_count) || 0;
    rows.push({ appci, avg_mttr_ns, problem_count });
  }
  return rows;
}
