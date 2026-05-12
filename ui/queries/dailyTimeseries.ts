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

export interface DailyTimeseriesParams {
  pivotIso: string;
  windowDays: number;
  appCiFilter: readonly string[];
  problemScope: ProblemScope;
}

// Daily timeseries: problem count, MTTR, and affected users per day.
// The central techopsApplicationList join is omitted; tier/director filtering
// happens in JS upstream by reducing appCiFilter to the effective set.
export function dailyTimeseriesQuery(params: DailyTimeseriesParams): string {
  const { pivotIso, windowDays, appCiFilter, problemScope } = params;
  const range = windowRange(pivotIso, windowDays);

  return `fetch dt.davis.problems, from: ${dqlString(range.preStartIso)}, to: ${dqlString(range.postEndIso)}
| filter event.kind == "DAVIS_PROBLEM" and dt.davis.is_duplicate == false
${categoryFilterLine(problemScope)}
| filter isNotNull(resolved_problem_duration)
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
| fieldsAdd affectedUsersRow = if(isNotNull(dt.davis.affected_users_count), dt.davis.affected_users_count, else: 0)
| makeTimeseries {
    count = count(),
    mttr_ns = avg(resolved_problem_duration),
    affected_users = sum(affectedUsersRow)
  }, interval: 1d`;
}
