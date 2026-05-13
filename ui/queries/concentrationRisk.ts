import { dqlString, windowRange } from "./dqlUtils";

export interface ConcentrationRiskParams {
  pivotIso: string;
  windowDays: number;
}

// Concentration risk: services where critical app dependency ratio is highest.
// High ratio = most consumers are critical apps (over-concentration risk).
// If the service fails, it impacts a high proportion of critical infrastructure.
export function concentrationRiskQuery(params: ConcentrationRiskParams): string {
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
| summarize
    critical_count = sum(is_critical),
    total_count = countDistinct(consumer_item),
    consumers = collectDistinct(consumer_item),
    by: {appci = provider}
| fieldsAdd concentration_ratio = critical_count / total_count * 100
| fieldsAdd appci = upper(appci)
| filter critical_count > 0
| sort concentration_ratio desc
| limit 10`;
}

export interface ConcentrationRiskRow {
  appci: string;
  critical_count: number;
  total_count: number;
  concentration_ratio: number;
  consumers: string[];
}

export function recordsToConcentrationRisk(records: ReadonlyArray<unknown> | undefined | null): ConcentrationRiskRow[] {
  if (!records) return [];
  const rows: ConcentrationRiskRow[] = [];
  for (const raw of records) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const appci = typeof r.appci === "string" ? r.appci : "";
    if (!appci) continue;
    const critical_count = typeof r.critical_count === "number" ? r.critical_count : Number(r.critical_count) || 0;
    const total_count = typeof r.total_count === "number" ? r.total_count : Number(r.total_count) || 0;
    const concentration_ratio = typeof r.concentration_ratio === "number" ? r.concentration_ratio : Number(r.concentration_ratio) || 0;
    const consumers = Array.isArray(r.consumers) ? (r.consumers as unknown as string[]).filter(c => typeof c === "string") : [];
    rows.push({ appci, critical_count, total_count, concentration_ratio, consumers });
  }
  return rows;
}
