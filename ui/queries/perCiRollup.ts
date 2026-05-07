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

export interface PerCiRollupParams {
  pivotIso: string;
  windowDays: number;
  /** Lowercase AppCI list to constrain the query to. Always required so the
   * query is bounded to the TechOps universe (avoids returning problems for
   * non-TechOps CIs). May come from the central lookup, the uploaded table,
   * or a filtered subset of either. */
  appCiFilter: readonly string[];
  problemScope: ProblemScope;
}

// Synthesis of dashboard tiles 1 (per-CI MTTR + counts) and 5 (per-CI revenue
// impact via the bizevents financial-loss lookup), with the central
// techopsApplicationList join removed: Tier / Director / ApplicationName
// enrichment happens in JS so the uploaded-table fallback works without
// requiring central lookup access.
//
// Deviations from the source dashboard:
//   - The fetch is bounded by the precise pre/post window computed in JS.
//   - The `filter (preMaxImpact > 0) or (postMaxImpact > 0)` line is removed
//     so CIs without bizevents financial-loss records still appear.
//   - The 50-row limit is raised to 5000.
//   - Tier/Director are enriched in JS from applicationList.
export function perCiRollupQuery(params: PerCiRollupParams): string {
  const { pivotIso, windowDays, appCiFilter, problemScope } = params;
  const range = windowRange(pivotIso, windowDays);

  return `fetch dt.davis.problems, from: ${dqlString(range.preStartIso)}, to: ${dqlString(range.postEndIso)}
| filter event.kind == "DAVIS_PROBLEM" and dt.davis.is_duplicate == false
${categoryFilterLine(problemScope)}
| filter isNotNull(resolved_problem_duration)
| fieldsAdd Bucket = if(timestamp < toTimestamp(${dqlString(range.pivotIso)}), "Pre", else: "Post")
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
    | fields applicationci = lower(applicationci), loss = u_1_day_total_financial_loss, ciname
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
    | fields applicationci, minLossDaily, maxLossDaily, lossBand = loss, ciname
  ], sourceField: singleAppCI, lookupField: applicationci, prefix: "loss."
| fieldsAdd durationDays = toDouble(resolved_problem_duration) / 86400000000000.0
| fieldsAdd minImpactRow = durationDays * coalesce(loss.minLossDaily, 0)
| fieldsAdd maxImpactRow = durationDays * coalesce(loss.maxLossDaily, 0)
| fieldsAdd preDur = if(Bucket == "Pre", resolved_problem_duration)
| fieldsAdd postDur = if(Bucket == "Post", resolved_problem_duration)
| fieldsAdd preId = if(Bucket == "Pre", display_id)
| fieldsAdd postId = if(Bucket == "Post", display_id)
| fieldsAdd preMinImpactRow = if(Bucket == "Pre", minImpactRow)
| fieldsAdd postMinImpactRow = if(Bucket == "Post", minImpactRow)
| fieldsAdd preMaxImpactRow = if(Bucket == "Pre", maxImpactRow)
| fieldsAdd postMaxImpactRow = if(Bucket == "Post", maxImpactRow)
| fieldsAdd preDurDays = if(Bucket == "Pre", durationDays)
| fieldsAdd postDurDays = if(Bucket == "Post", durationDays)
| summarize {
    preMTTR = avg(preDur),
    postMTTR = avg(postDur),
    preCount = countDistinct(preId),
    postCount = countDistinct(postId),
    preMinImpact = sum(preMinImpactRow),
    postMinImpact = sum(postMinImpactRow),
    preMaxImpact = sum(preMaxImpactRow),
    postMaxImpact = sum(postMaxImpactRow),
    preDurationDays = sum(preDurDays),
    postDurationDays = sum(postDurDays),
    lossBand = takeAny(loss.lossBand),
    ciname = takeAny(loss.ciname)
  }, by: { singleAppCI }
| fieldsAdd singleAppCI = upper(singleAppCI)
| fieldsAdd preMTTR_ns = toDouble(preMTTR)
| fieldsAdd postMTTR_ns = toDouble(postMTTR)
| fieldsAdd mttrPctChange = if(isNull(preMTTR_ns) and isNull(postMTTR_ns), null,
                             else: if(isNull(preMTTR_ns), 9999.0,
                             else: if(isNull(postMTTR_ns) or postMTTR_ns == 0, -100.0,
                             else: (postMTTR_ns - preMTTR_ns) / preMTTR_ns * 100)))
| fieldsAdd countPctChange = if(preCount == 0 and postCount == 0, null,
                              else: if(preCount == 0, 9999.0,
                              else: if(postCount == 0, -100.0,
                              else: (toDouble(postCount) - toDouble(preCount)) / toDouble(preCount) * 100)))
| fieldsAdd preAvgImpact = if(isNull(preMinImpact) and isNull(preMaxImpact), null,
                            else: (coalesce(preMinImpact, 0) + coalesce(preMaxImpact, 0)) / 2)
| fieldsAdd postAvgImpact = if(isNull(postMinImpact) and isNull(postMaxImpact), null,
                             else: (coalesce(postMinImpact, 0) + coalesce(postMaxImpact, 0)) / 2)
| fieldsAdd avgImpactPctChange = if((isNull(preAvgImpact) or preAvgImpact == 0) and (isNull(postAvgImpact) or postAvgImpact == 0), null,
                                  else: if(isNull(preAvgImpact) or preAvgImpact == 0, 9999.0,
                                  else: if(isNull(postAvgImpact) or postAvgImpact == 0, -100.0,
                                  else: (postAvgImpact - preAvgImpact) / preAvgImpact * 100)))
| sort singleAppCI asc
| limit 5000`;
}
