import { dqlString, windowRange } from "./dqlUtils";

export interface HighThroughputCriticalParams {
  pivotIso: string;
  windowDays: number;
}

// High-throughput services used by critical apps: services ranked by total request volume from T1/T2 apps.
// High volume from critical apps = high-stakes traffic concentration.
// If performance degrades, critical business throughput is directly impacted.
export function highThroughputCriticalQuery(params: HighThroughputCriticalParams): string {
  const { pivotIso, windowDays } = params;

  return `fetch bizevents, from: -24h
| filter event.type == "workflow.summary.service"
| fieldsAdd provider = lower(toString(producer.appci))
| filter isNotNull(provider) and provider != ""
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
| filter isNotNull(t1t2.applicationci)
| summarize
    critical_req_volume = sum(coalesce(requestCount, 0)),
    critical_consumers = countDistinct(consumer_item),
    consumers = collectDistinct(consumer_item),
    by: {appci = provider}
| fieldsAdd appci = upper(appci)
| sort critical_req_volume desc
| limit 10`;
}

export interface HighThroughputCriticalRow {
  appci: string;
  critical_req_volume: number;
  critical_consumers: number;
  consumers: string[];
}

export function recordsToHighThroughputCritical(records: ReadonlyArray<unknown> | undefined | null): HighThroughputCriticalRow[] {
  if (!records) return [];
  const rows: HighThroughputCriticalRow[] = [];
  for (const raw of records) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const appci = typeof r.appci === "string" ? r.appci : "";
    if (!appci) continue;
    const critical_req_volume = typeof r.critical_req_volume === "number" ? r.critical_req_volume : Number(r.critical_req_volume) || 0;
    const critical_consumers = typeof r.critical_consumers === "number" ? r.critical_consumers : Number(r.critical_consumers) || 0;
    const consumers = Array.isArray(r.consumers) ? (r.consumers as unknown as string[]).filter(c => typeof c === "string") : [];
    rows.push({ appci, critical_req_volume, critical_consumers, consumers });
  }
  return rows;
}
