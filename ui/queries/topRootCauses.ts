import {
  categoryFilterLine,
  dqlIn,
  dqlInFilterLine,
  dqlString,
  IMPACT_LEVELS,
  type ProblemScope,
  STATUSES,
  USER_IMPACT_VALUES,
  windowRange,
} from "./dqlUtils";

export interface TopRootCausesParams {
  pivotIso: string;
  windowDays: number;
  appCiFilter: readonly string[];
  problemScope: ProblemScope;
}

export interface RootCauseEntry {
  name: string;
  count: number;
  cis: string[];
}

export function topRootCausesQuery(params: TopRootCausesParams): string {
  const { pivotIso, windowDays, appCiFilter, problemScope } = params;
  const range = windowRange(pivotIso, windowDays);

  return `fetch dt.davis.problems, from: ${dqlString(range.pivotIso)}, to: ${dqlString(range.postEndIso)}
| filter event.kind == "DAVIS_PROBLEM" and dt.davis.is_duplicate == false
${categoryFilterLine(problemScope)}
| expand impactLevel = dt.davis.impact_level
| filter ${dqlIn("impactLevel", IMPACT_LEVELS)}
| dedup display_id, sort: { timestamp desc }
| fieldsAdd applicationci = arrayDistinct(iCollectArray(splitString(arrayRemoveNulls(iCollectArray(if(matchesPhrase(entity_tags[], "*applicationci*"), lower(entity_tags[]))))[], ":")[1]))
| fieldsAdd applicationci = arrayDistinct(iCollectArray(splitString(applicationci[], ",")[0]))
| filter isNotNull(applicationci) and applicationci[0] != "empty"
| expand singleAppCI = applicationci
${dqlInFilterLine("singleAppCI", appCiFilter)}
| filter ${dqlIn("event.status", STATUSES)}
| fieldsAdd usersAreAffected = if(isNotNull(dt.davis.affected_users_count), "YES", else: "NO")
| filter ${dqlIn("usersAreAffected", USER_IMPACT_VALUES)}
| filter isNotNull(root_cause_entity_name)
| summarize problemCount = countDistinct(display_id), affectedCis = collectDistinct(singleAppCI), by: { rootCause = root_cause_entity_name }
| sort problemCount desc
| limit 10`;
}

export function recordsToRootCauses(
  records: ReadonlyArray<unknown> | undefined,
): RootCauseEntry[] {
  if (!records) return [];
  const out: RootCauseEntry[] = [];
  for (const r of records) {
    if (!r || typeof r !== "object") continue;
    const rec = r as Record<string, unknown>;
    const name = typeof rec.rootCause === "string" ? rec.rootCause : null;
    const count = typeof rec.problemCount === "number"
      ? rec.problemCount
      : typeof rec.problemCount === "string"
        ? Number(rec.problemCount)
        : typeof rec.problemCount === "bigint"
          ? Number(rec.problemCount)
          : 0;
    const cis = Array.isArray(rec.affectedCis)
      ? (rec.affectedCis as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
    if (name) out.push({ name, count, cis });
  }
  return out;
}
