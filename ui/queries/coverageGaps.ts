import { dqlString, windowRange } from "./dqlUtils";

export interface CoverageGapsParams {
  pivotIso: string;
  windowDays: number;
}

// T1 + T2 apps with no recent log ingest.
// Prioritize by: URGENT (active problems + no logs) > HIGH (T1) > MEDIUM (T2)
export function coverageGapsQuery(params: CoverageGapsParams): string {
  const { pivotIso, windowDays } = params;
  const range = windowRange(pivotIso, windowDays);

  return `fetch bizevents, from: -24h
| filter event.type == "workflow.import.servicenow.appci"
| filter in(tier, {"1 - most critical", "2 - somewhat critical"})
| filterOut matchesPhrase(ciname, "RETIRED")
| fields applicationci = lower(applicationci), ciname, app_owner_name, tier
| dedup applicationci
| lookup [
    fetch logs, from: -1h, samplingRatio: 100
    | filter isNotNull(applicationci)
    | fieldsAdd app_ci = lower(applicationci)
    | summarize log_count = count() , by: {app_ci}
  ], sourceField: applicationci, lookupField: app_ci, prefix: "l."
| lookup [
    fetch dt.davis.problems, from: -24h
    | filter event.kind == "DAVIS_PROBLEM" and dt.davis.is_duplicate == false
    | fieldsAdd tags_str = toString(entity_tags)
    | parse tags_str, """LD 'applicationci:' LD:appci '"' LD"""
    | filter isNotNull(appci) and appci != ""
    | summarize active_probs = countIf(event.status == "ACTIVE") , by: {appci = lower(appci)}
  ], sourceField: applicationci, lookupField: appci, prefix: "p."
| fieldsAdd
    has_logs = if(isNotNull(l.log_count) and l.log_count > 0, true, else: false),
    priority = if(isNotNull(p.active_probs) and p.active_probs > 0 and has_logs == false, "URGENT",
                else: if(tier == "1 - most critical", "HIGH", else: "MEDIUM"))
| filter has_logs == false
| sort priority asc, tier asc
| limit 10`;
}

export interface CoverageGapsRow {
  applicationci: string;
  ciname: string;
  app_owner_name: string;
  tier: string;
  has_logs: boolean;
  priority: "URGENT" | "HIGH" | "MEDIUM";
  p_active_probs: number;
}

export function recordsToCoverageGaps(records: ReadonlyArray<unknown> | undefined | null): CoverageGapsRow[] {
  if (!records) return [];
  const rows: CoverageGapsRow[] = [];
  for (const raw of records) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const applicationci = typeof r.applicationci === "string" ? r.applicationci : "";
    if (!applicationci) continue;
    const ciname = typeof r.ciname === "string" ? r.ciname : "";
    const app_owner_name = typeof r.app_owner_name === "string" ? r.app_owner_name : "";
    const tier = typeof r.tier === "string" ? r.tier : "";
    const has_logs = r.has_logs === true;
    const priority = (r.priority === "URGENT" || r.priority === "HIGH" || r.priority === "MEDIUM") ? r.priority : "MEDIUM";
    const p_active_probs = typeof r.p_active_probs === "number" ? r.p_active_probs : Number(r.p_active_probs) || 0;
    rows.push({ applicationci, ciname, app_owner_name, tier, has_logs, priority, p_active_probs });
  }
  return rows;
}
