import {
  dqlIn,
  dqlString,
  type ProblemScope,
  STATUSES,
  windowRange,
} from "./dqlUtils";

export interface CascadeRiskParams {
  pivotIso: string;
  windowDays: number;
  appCiFilter: readonly string[];
  problemScope: ProblemScope;
}

// Top SPOFs (Single Points of Failure) by blast radius.
// Blast radius = count of distinct downstream apps consuming this service.
// High request volume amplifies SPOF risk.
export function cascadeRiskQuery(params: CascadeRiskParams): string {
  const { pivotIso, windowDays, appCiFilter } = params;
  const range = windowRange(pivotIso, windowDays);

  return `fetch bizevents, from: -24h
| filter event.type == "workflow.summary.service"
| fieldsAdd provider = lower(toString(producer.appci))
| filter isNotNull(provider) and provider != ""
| filter in(provider, {${appCiFilter.map(dqlString).join(", ")}})
| expand consumer_item = consumer.appci
| fieldsAdd consumer_item = lower(toString(consumer_item))
| filter isNotNull(consumer_item) and consumer_item != ""
| summarize
    distinct_consumers = countDistinct(consumer_item),
    total_req_volume = sum(coalesce(requestCount, 0)),
    consumers = collectDistinct(consumer_item)
  , by:{appci = provider}
| fieldsAdd appci = upper(appci)
| sort distinct_consumers desc
| limit 10`;
}

export interface CascadeRiskRow {
  appci: string;
  distinct_consumers: number;
  total_req_volume: number;
  consumers: string[];
}

export function recordsToCascadeRisk(records: ReadonlyArray<unknown> | undefined | null): CascadeRiskRow[] {
  if (!records) return [];
  const rows: CascadeRiskRow[] = [];
  for (const raw of records) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const appci = typeof r.appci === "string" ? r.appci : "";
    if (!appci) continue;
    const distinct_consumers = typeof r.distinct_consumers === "number" ? r.distinct_consumers : Number(r.distinct_consumers) || 0;
    const total_req_volume = typeof r.total_req_volume === "number" ? r.total_req_volume : Number(r.total_req_volume) || 0;
    const consumers = Array.isArray(r.consumers) ? (r.consumers as unknown as string[]).filter(c => typeof c === "string") : [];
    rows.push({ appci, distinct_consumers, total_req_volume, consumers });
  }
  return rows;
}
