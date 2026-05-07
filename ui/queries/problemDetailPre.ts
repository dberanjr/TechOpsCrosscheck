import {
  categoryFilterLine,
  dqlIn,
  dqlString,
  IMPACT_LEVELS,
  type ProblemScope,
  STATUSES,
  USER_IMPACT_VALUES,
  windowRange,
} from "./dqlUtils";

export interface ProblemDetailParams {
  pivotIso: string;
  windowDays: number;
  ciId: string; // lowercase singleAppCI
  problemScope: ProblemScope;
}

const BIZEVENT_LOOKUP = `| lookup [
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
  ], sourceField: singleAppCI, lookupField: applicationci, prefix: "loss."`;

export function problemDetailPreQuery(params: ProblemDetailParams): string {
  const { pivotIso, windowDays, ciId, problemScope } = params;
  const range = windowRange(pivotIso, windowDays);

  return `fetch dt.davis.problems, from: ${dqlString(range.preStartIso)}, to: ${dqlString(range.pivotIso)}
| filter event.kind == "DAVIS_PROBLEM" and dt.davis.is_duplicate == false
${categoryFilterLine(problemScope)}
| expand impactLevel = dt.davis.impact_level
| filter ${dqlIn("impactLevel", IMPACT_LEVELS)}
| dedup display_id, sort: { timestamp desc }
| fieldsAdd applicationci = arrayDistinct(iCollectArray(splitString(arrayRemoveNulls(iCollectArray(if(matchesPhrase(entity_tags[], "*applicationci*"), lower(entity_tags[]))))[], ":")[1]))
| fieldsAdd applicationci = arrayDistinct(iCollectArray(splitString(applicationci[], ",")[0]))
| filter isNotNull(applicationci) and applicationci[0] != "empty"
| expand singleAppCI = applicationci
| filter singleAppCI == ${dqlString(ciId.toLowerCase())}
| filter ${dqlIn("event.status", STATUSES)}
| fieldsAdd usersAreAffected = if(isNotNull(dt.davis.affected_users_count), "YES", else: "NO")
| filter ${dqlIn("usersAreAffected", USER_IMPACT_VALUES)}
${BIZEVENT_LOOKUP}
| fieldsAdd durationNs = toDouble(resolved_problem_duration)
| fieldsAdd durationDays = durationNs / 86400000000000.0
| fieldsAdd estImpactAvg = (durationDays * coalesce(loss.minLossDaily, 0) + durationDays * coalesce(loss.maxLossDaily, 0)) / 2
| fields display_id, event.id, event.name, event.status, dt.davis.impact_level, durationNs, dt.davis.affected_users_count, timestamp, dt.davis.event_count, estImpactAvg, root_cause_entity_name
| sort durationNs desc`;
}
