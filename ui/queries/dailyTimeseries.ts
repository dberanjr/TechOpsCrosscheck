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

// Constructed query (no source-dashboard equivalent). Drives the headline-card
// sparklines: one row per series with arrays of daily values for problem count,
// MTTR (in nanoseconds), and average financial impact. The central
// techopsApplicationList join is omitted; tier/director filtering happens in JS
// upstream by reducing appCiFilter to the effective set.
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
| lookup [
    fetch bizevents, from: -24h
    | filter event.type == "workflow.import.servicenow.appci.service_discovered"
    | dedup applicationci
    | fields applicationci = lower(applicationci), loss = u_1_day_total_financial_loss
    | filter isNotNull(loss)
    | parse loss, """ "$" LD:minStr " - $" LD:maxStr """, parsingPrerequisite: isNotNull(loss)
    | parse loss, """ "Over $" LD:minStr """, parsingPrerequisite: (isNotNull(loss) and isNull(maxStr))
    | fieldsAdd minLossDaily = if(contains(minStr, "K"), toLong(splitString(minStr, "K")[0]) * 1000,
                                else: if(contains(minStr, "M"), toLong(splitString(minStr, "M")[0]) * 1000000,
                                else: 0))
    | fieldsAdd maxLossDaily = if(isNull(maxStr), minLossDaily * 2,
                                else: if(contains(maxStr, "K"), toLong(splitString(maxStr, "K")[0]) * 1000,
                                else: if(contains(maxStr, "M"), toLong(splitString(maxStr, "M")[0]) * 1000000,
                                else: 0)))
    | fields applicationci, minLossDaily, maxLossDaily
  ], sourceField: singleAppCI, lookupField: applicationci, prefix: "loss."
| fieldsAdd durationDays = toDouble(resolved_problem_duration) / 86400000000000.0
| fieldsAdd avgImpactRow = (coalesce(loss.minLossDaily, 0) + coalesce(loss.maxLossDaily, 0)) / 2.0 * durationDays
| makeTimeseries {
    count = count(),
    mttr_ns = avg(resolved_problem_duration),
    impact = sum(avgImpactRow)
  }, interval: 1d`;
}
