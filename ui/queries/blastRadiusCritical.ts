import { dqlString, windowRange } from "./dqlUtils";

export interface BlastRadiusCriticalParams {
  pivotIso: string;
  windowDays: number;
}

// Blast radius to critical apps: services ranked by how many unique T1/T2 apps would be affected.
// Pure count of critical consumers - identifies services where critical app concentration is highest.
export function blastRadiusCriticalQuery(params: BlastRadiusCriticalParams): string {
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
| fieldsAdd is_critical = if(isNotNull(t1t2.applicationci), 1, else: 0)
| filter is_critical == 1
| summarize critical_apps = countDistinct(consumer_item), critical_consumers = collectDistinct(consumer_item), by: {appci = provider}
| fieldsAdd appci = upper(appci)
| sort critical_apps desc
| limit 10`;
}

export interface BlastRadiusCriticalRow {
  appci: string;
  critical_apps: number;
  critical_consumers: string[];
}

export function recordsToBlastRadiusCritical(records: ReadonlyArray<unknown> | undefined | null): BlastRadiusCriticalRow[] {
  if (!records) return [];
  const rows: BlastRadiusCriticalRow[] = [];
  for (const raw of records) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const appci = typeof r.appci === "string" ? r.appci : "";
    if (!appci) continue;
    const critical_apps = typeof r.critical_apps === "number" ? r.critical_apps : Number(r.critical_apps) || 0;
    const critical_consumers = Array.isArray(r.critical_consumers) ? (r.critical_consumers as unknown as string[]).filter(c => typeof c === "string") : [];
    rows.push({ appci, critical_apps, critical_consumers });
  }
  return rows;
}
