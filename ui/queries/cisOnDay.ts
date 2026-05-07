import {
  categoryFilterLine,
  dqlIn,
  dqlInFilterLine,
  dqlString,
  IMPACT_LEVELS,
  type ProblemScope,
  STATUSES,
  USER_IMPACT_VALUES,
} from "./dqlUtils";

export interface CisOnDayParams {
  dayStartIso: string; // UTC ISO, e.g. "2026-02-15T00:00:00.000Z"
  appCiFilter: readonly string[];
  problemScope: ProblemScope;
}

export function cisOnDayQuery(params: CisOnDayParams): string {
  const { dayStartIso, appCiFilter, problemScope } = params;
  const dayEndIso = new Date(new Date(dayStartIso).getTime() + 86_400_000).toISOString();

  return `fetch dt.davis.problems, from: ${dqlString(dayStartIso)}, to: ${dqlString(dayEndIso)}
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
| summarize problemCount = countDistinct(display_id), by: { singleAppCI }`;
}

export function recordsToCiSet(records: ReadonlyArray<unknown> | undefined): Set<string> {
  const set = new Set<string>();
  if (!records) return set;
  for (const r of records) {
    if (!r || typeof r !== "object") continue;
    const ci = (r as Record<string, unknown>).singleAppCI;
    if (typeof ci === "string" && ci) set.add(ci.toLowerCase());
  }
  return set;
}
