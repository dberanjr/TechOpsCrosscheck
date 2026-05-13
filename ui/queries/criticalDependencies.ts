import { dqlString, windowRange } from "./dqlUtils";

export interface CriticalDependenciesParams {
  pivotIso: string;
  windowDays: number;
}

// Most critical dependencies: services ranked by how many critical (T1/T2) apps depend on them.
// Identifies essential linchpin services where outages would impact the most critical apps.
export function criticalDependenciesQuery(params: CriticalDependenciesParams): string {
  const { pivotIso, windowDays } = params;
  const range = windowRange(pivotIso, windowDays);

  return `fetch bizevents, from: -24h
| filter event.type == "workflow.summary.service"
| fieldsAdd provider = lower(toString(producer.appci))
| fieldsAdd consumer_item_raw = toString(consumer.appci)
| filter isNotNull(provider) and provider != "" and isNotNull(consumer_item_raw)
| expand consumer_item = consumer.appci
| fieldsAdd consumer_item = lower(toString(consumer_item))
| filter isNotNull(consumer_item) and consumer_item != ""
| lookup [
    fetch bizevents, from: -24h
    | filter event.type == "workflow.import.servicenow.appci"
    | filter in(tier, {"1 - most critical", "2 - somewhat critical"})
    | fields applicationci = lower(applicationci), tier
    | dedup applicationci
  ], sourceField: consumer_item, lookupField: applicationci, prefix: "t1t2."
| fieldsAdd is_critical_consumer = if(isNotNull(t1t2.applicationci), 1, else: 0)
| summarize
    critical_consumers = sum(is_critical_consumer),
    total_consumers = countDistinct(consumer_item),
    total_req_volume = sum(coalesce(requestCount, 0))
  , by: {appci = provider}
| filter critical_consumers > 0
| fieldsAdd appci = upper(appci)
| fieldsAdd criticality_score = critical_consumers * 100 + total_consumers
| sort criticality_score desc
| limit 10`;
}

export interface CriticalDependenciesRow {
  appci: string;
  critical_consumers: number;
  total_consumers: number;
  total_req_volume: number;
}

export function recordsToCriticalDependencies(records: ReadonlyArray<unknown> | undefined | null): CriticalDependenciesRow[] {
  if (!records) return [];
  const rows: CriticalDependenciesRow[] = [];
  for (const raw of records) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const appci = typeof r.appci === "string" ? r.appci : "";
    if (!appci) continue;
    const critical_consumers = typeof r.critical_consumers === "number" ? r.critical_consumers : Number(r.critical_consumers) || 0;
    const total_consumers = typeof r.total_consumers === "number" ? r.total_consumers : Number(r.total_consumers) || 0;
    const total_req_volume = typeof r.total_req_volume === "number" ? r.total_req_volume : Number(r.total_req_volume) || 0;
    rows.push({ appci, critical_consumers, total_consumers, total_req_volume });
  }
  return rows;
}
