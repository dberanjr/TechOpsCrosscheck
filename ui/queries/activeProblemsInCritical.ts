import { dqlString, windowRange } from "./dqlUtils";

export interface ActiveProblemsInCriticalParams {
  pivotIso: string;
  windowDays: number;
}

// Active problems in critical apps: services that are currently causing incidents in T1/T2 applications.
// Real-time visibility into which services are actively degrading critical business operations RIGHT NOW.
// Helps prioritize incident response by impact on critical tier.
export function activeProblemsInCriticalQuery(params: ActiveProblemsInCriticalParams): string {
  const { pivotIso, windowDays } = params;

  return `fetch dt.davis.problems, from: -24h
| filter event.kind == "DAVIS_PROBLEM" and event.status == "ACTIVE" and dt.davis.is_duplicate == false
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
    active_problems = count(),
    affected_critical_apps = countDistinct(appci),
    by: {service_id = root_service}
| fieldsAdd appci = upper(service_id)
| sort active_problems desc
| limit 10`;
}

export interface ActiveProblemsInCriticalRow {
  appci: string;
  active_problems: number;
  affected_critical_apps: number;
}

export function recordsToActiveProblemsInCritical(records: ReadonlyArray<unknown> | undefined | null): ActiveProblemsInCriticalRow[] {
  if (!records) return [];
  const rows: ActiveProblemsInCriticalRow[] = [];
  for (const raw of records) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const appci = typeof r.appci === "string" ? r.appci : "";
    if (!appci || appci === "UNKNOWN") continue;
    const active_problems = typeof r.active_problems === "number" ? r.active_problems : Number(r.active_problems) || 0;
    const affected_critical_apps = typeof r.affected_critical_apps === "number" ? r.affected_critical_apps : Number(r.affected_critical_apps) || 0;
    rows.push({ appci, active_problems, affected_critical_apps });
  }
  return rows;
}
