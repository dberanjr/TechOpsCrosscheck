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

// Per-CI problem metrics: MTTR, count, and affected users (no financial impact).
// Tier / Director / ApplicationName enrichment happens in JS so the
// uploaded-table fallback works without requiring central lookup access.
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
| fieldsAdd preDur = if(Bucket == "Pre", resolved_problem_duration)
| fieldsAdd postDur = if(Bucket == "Post", resolved_problem_duration)
| fieldsAdd preId = if(Bucket == "Pre", display_id)
| fieldsAdd postId = if(Bucket == "Post", display_id)
| fieldsAdd preUsersAffected = if(Bucket == "Pre" and isNotNull(dt.davis.affected_users_count), dt.davis.affected_users_count, else: 0)
| fieldsAdd postUsersAffected = if(Bucket == "Post" and isNotNull(dt.davis.affected_users_count), dt.davis.affected_users_count, else: 0)
| summarize {
    preMTTR = avg(preDur),
    postMTTR = avg(postDur),
    preCount = countDistinct(preId),
    postCount = countDistinct(postId),
    preAffectedUsers = sum(preUsersAffected),
    postAffectedUsers = sum(postUsersAffected)
  } , by: { singleAppCI }
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
| fieldsAdd affectedUsersPctChange = if(preAffectedUsers == 0 and postAffectedUsers == 0, null,
                                       else: if(preAffectedUsers == 0, 9999.0,
                                       else: if(postAffectedUsers == 0, -100.0,
                                       else: (toDouble(postAffectedUsers) - toDouble(preAffectedUsers)) / toDouble(preAffectedUsers) * 100)))
| sort singleAppCI asc
| limit 50000`;
}
