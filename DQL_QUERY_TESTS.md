# DQL Query Tests for TechOps Crosscheck Refactor
## Run these queries with dtctl to validate data availability

**Run with:** `dtctl query -f <filename>.dql`

---

## Test 1: Affected Users per App (Last 7 Days)

**File:** `test_1_affected_users.dql`

```dql
fetch dt.davis.problems, from:-7d
| filter event.kind == "DAVIS_PROBLEM" AND dt.davis.is_duplicate == false
| fieldsAdd tags_str = toString(entity_tags)
| filter matchesPhrase(tags_str, "applicationci:")
| parse tags_str, """LD 'applicationci:' LD:appci '"' LD"""
| filter isNotNull(appci) and appci != ""
| fieldsAdd appci = lower(appci)
| summarize
    problems = count(),
    users_affected_count = countIf(isNotNull(dt.davis.affected_users_count) and dt.davis.affected_users_count > 0),
    total_users_impacted = sumIf(dt.davis.affected_users_count),
    avg_users_per_problem = avgIf(dt.davis.affected_users_count),
    avg_mttr_ns = avg(if(event.status == "CLOSED" and isNotNull(resolved_problem_duration), resolved_problem_duration, else:null))
  by:{appci}
| sort problems desc
| limit 20
```

**Expected Columns:**
- `appci` — Application CI code (lowercase)
- `problems` — Total problem count
- `users_affected_count` — Count of problems with affected_users > 0
- `total_users_impacted` — Sum of affected_users_count
- `avg_users_per_problem` — Average users per problem
- `avg_mttr_ns` — Average MTTR in nanoseconds

**Notes:**
- Confirms `dt.davis.affected_users_count` is available and populated
- If zeros/nulls: may need to check Davis problem data completeness
- If working: can replace revenue metrics with user impact

---

## Test 2: Affected Users with Tier Context (Last 7 Days)

**File:** `test_2_affected_users_tier.dql`

```dql
fetch dt.davis.problems, from:-7d
| filter event.kind == "DAVIS_PROBLEM" AND dt.davis.is_duplicate == false
| fieldsAdd tags_str = toString(entity_tags)
| filter matchesPhrase(tags_str, "applicationci:")
| parse tags_str, """LD 'applicationci:' LD:appci '"' LD"""
| filter isNotNull(appci) and appci != ""
| fieldsAdd appci = lower(appci)
| lookup [
    fetch bizevents, from:-24h
    | filter event.type == "workflow.import.servicenow.appci"
    | filterOut matchesPhrase(ciname, "RETIRED")
    | fields applicationci = lower(applicationci), tier, app_owner_name, ciname
    | dedup applicationci
  ], sourceField:appci, lookupField:applicationci, prefix:"cmdb."
| filter isNotNull(cmdb.tier)
| summarize
    problems = count(),
    users_affected_count = countIf(isNotNull(dt.davis.affected_users_count) and dt.davis.affected_users_count > 0),
    total_users_impacted = sumIf(dt.davis.affected_users_count)
  by:{appci, tier=cmdb.tier, owner=cmdb.app_owner_name}
| sort tier asc, problems desc
| limit 30
```

**Expected Columns:**
- `appci`, `problems`, `users_affected_count`, `total_users_impacted` (as above)
- `tier` — Tier from ServiceNow (e.g., "1 - most critical")
- `owner` — App owner name

**Notes:**
- Tests integration with ServiceNow CMDB bizevent lookup
- If empty results: may indicate no matching CMDB records or bizevent flow issue
- If working: ready to replace in perCiRollup query

---

## Test 3: Cascade Risk / Blast Radius (Dependency Graph)

**File:** `test_3_cascade_risk.dql`

```dql
fetch bizevents, from:-24h
| filter event.type == "workflow.summary.service"
| fieldsAdd provider = toLowerCase(toString(event.payload.provider.ci))
| fieldsAdd consumer_str = toString(event.payload.consumers)
| filter isNotNull(provider) and provider != "" and matchesPhrase(consumer_str, "ci:")
| fieldsAdd consumers = arraySize(event.payload.consumers[])
| lookup [
    fetch bizevents, from:-24h
    | filter event.type == "workflow.import.servicenow.appci"
    | fields applicationci = lower(applicationci), tier, app_owner_name, ciname
    | dedup applicationci
  ], sourceField:provider, lookupField:applicationci, prefix:"cmdb."
| filter isNotNull(cmdb.tier)
| summarize
    distinct_consumers = countDistinct(event.payload.consumers[].ci),
    total_req_volume = sum(coalesce(event.payload.request_volume, 0))
  by:{appci=provider, tier=cmdb.tier, owner=cmdb.app_owner_name}
| sort distinct_consumers desc
| limit 20
```

**Expected Columns:**
- `appci` — Provider service/app CI
- `distinct_consumers` — Blast radius (count of downstream apps)
- `total_req_volume` — Request volume through this service
- `tier`, `owner` — From CMDB lookup

**Notes:**
- Depends on `workflow.summary.service` bizevents
- `distinct_consumers` should be >= 1 (at minimum, itself)
- High `distinct_consumers` (>= 5) = SPOF candidates
- If empty: dependency graph data not flowing OR workflow events not configured

---

## Test 4: Observability Coverage Gaps (T1+T2 Apps)

**File:** `test_4_coverage_gaps.dql`

```dql
fetch bizevents, from:-24h
| filter event.type == "workflow.import.servicenow.appci"
| filter in(tier, {"1 - most critical", "2 - somewhat critical"})
| filterOut matchesPhrase(ciname, "RETIRED")
| fields applicationci = lower(applicationci), ciname, app_owner_name, tier
| dedup applicationci
| lookup [
    fetch logs, from:-1h, samplingRatio:100
    | filter isNotNull(applicationci)
    | fieldsAdd app_ci = toLowerCase(applicationci)
    | summarize log_count = count(), by:{app_ci}
  ], sourceField:applicationci, lookupField:app_ci, prefix:"l."
| lookup [
    fetch dt.davis.problems, from:-24h
    | filter event.kind=="DAVIS_PROBLEM" and dt.davis.is_duplicate==false
    | fieldsAdd tags_str = toString(entity_tags)
    | parse tags_str, """LD 'applicationci:' LD:appci '"' LD"""
    | filter isNotNull(appci) and appci != ""
    | summarize active_probs = countIf(event.status=="ACTIVE"), by:{appci = lower(appci)}
  ], sourceField:applicationci, lookupField:appci, prefix:"p."
| fieldsAdd
    has_logs = if(isNotNull(l.log_count) and l.log_count > 0, true, else:false),
    priority = if(isNotNull(p.active_probs) and p.active_probs > 0 and has_logs == false, "URGENT",
                else:if(tier == "1 - most critical", "HIGH", else:"MEDIUM"))
| filter has_logs == false
| sort priority asc, tier asc
| limit 20
```

**Expected Columns:**
- `applicationci` — App CI (lowercase)
- `ciname`, `tier`, `app_owner_name` — From CMDB
- `has_logs` — Boolean: logs found in last 1h?
- `l.log_count` — Count of log records
- `p.active_probs` — Count of active problems
- `priority` — URGENT / HIGH / MEDIUM

**Notes:**
- Flags T1+T2 apps with NO log ingest
- URGENT = no logs + active problems
- If empty result: all T1+T2 apps have good coverage (good sign!)
- If high count: major observability gaps

---

## Test 5: MTTR Timeseries per App (Last 30 Days)

**File:** `test_5_mttr_timeseries.dql`

```dql
fetch dt.davis.problems, from:-30d
| filter event.kind == "DAVIS_PROBLEM" AND dt.davis.is_duplicate == false
| fieldsAdd tags_str = toString(entity_tags)
| filter matchesPhrase(tags_str, "applicationci:")
| parse tags_str, """LD 'applicationci:' LD:appci '"' LD"""
| filter isNotNull(appci) and appci != ""
| fieldsAdd appci = lower(appci)
| summarize
    problem_count = count(),
    avg_mttr_ns = avg(if(event.status == "CLOSED" and isNotNull(resolved_problem_duration), resolved_problem_duration, else:null)),
    closed_problems = countIf(event.status == "CLOSED")
  by:{
    bucket = datefloor(timestamp, 1d),
    appci
  }
| filter isNotNull(avg_mttr_ns)
| sort bucket asc, appci asc
| limit 500
```

**Expected Columns:**
- `bucket` — Day bucket (ISO timestamp)
- `appci` — Application CI
- `problem_count` — Problems in that day
- `avg_mttr_ns` — Average MTTR in nanoseconds
- `closed_problems` — Count of closed problems

**Notes:**
- Provides per-app MTTR trends over time
- Can be charted as line graph (like MttrTrend.tsx from Polaris)
- Nanoseconds need conversion (divide by 1e9 for seconds)
- Supports 7d, 30d, 60d, 90d, 180d, 365d ranges

---

## Test 6: Per-CI Pre/Post Comparison (Example: Last 90 Days, Pivot 45 Days Ago)

**File:** `test_6_prepost_comparison.dql`

```dql
fetch dt.davis.problems, from:-90d
| filter event.kind == "DAVIS_PROBLEM" AND dt.davis.is_duplicate == false
| fieldsAdd tags_str = toString(entity_tags)
| filter matchesPhrase(tags_str, "applicationci:")
| parse tags_str, """LD 'applicationci:' LD:appci '"' LD"""
| filter isNotNull(appci) and appci != ""
| fieldsAdd appci = lower(appci)
| fieldsAdd
    pivot_ts = 1644249600000,  // Example: 2022-02-07 (45 days back from ~2022-03-24)
    is_post = if(timestamp >= pivot_ts, true, else:false)
| lookup [
    fetch bizevents, from:-24h
    | filter event.type == "workflow.import.servicenow.appci"
    | fields applicationci = lower(applicationci), tier, app_owner_name, ciname
    | dedup applicationci
  ], sourceField:appci, lookupField:applicationci, prefix:"cmdb."
| filter isNotNull(cmdb.tier)
| summarize
    pre_problems = countIf(is_post == false),
    post_problems = countIf(is_post == true),
    pre_users_affected = sumIf(dt.davis.affected_users_count, is_post == false),
    post_users_affected = sumIf(dt.davis.affected_users_count, is_post == true),
    pre_mttr_ns = avgIf(if(event.status == "CLOSED" and isNotNull(resolved_problem_duration), resolved_problem_duration, else:null), is_post == false),
    post_mttr_ns = avgIf(if(event.status == "CLOSED" and isNotNull(resolved_problem_duration), resolved_problem_duration, else:null), is_post == true)
  by:{appci, tier=cmdb.tier}
| sort tier asc, appci asc
| limit 50
```

**Expected Columns:**
- `appci`, `tier` — App CI and tier
- `pre_problems`, `post_problems` — Problem counts
- `pre_users_affected`, `post_users_affected` — User impact counts
- `pre_mttr_ns`, `post_mttr_ns` — MTTR in nanoseconds

**Notes:**
- Change `pivot_ts` to actual timestamp (milliseconds since epoch)
- This structure becomes the basis for new Crosscheck metric cards
- Compare pre vs post to identify regressions in user impact
- No revenue metrics — purely user/problem/duration metrics

---

## Run All Tests

Save each query to a `.dql` file and run:

```bash
for i in 1 2 3 4 5 6; do
  echo "=== Test $i ==="
  dtctl query -f test_${i}*.dql 2>&1 | head -30
done
```

---

## Expected Results

| Test | Should Work | Impact if Fails |
|------|------------|-----------------|
| Test 1 | ✓ (core metric) | Affected users unavailable; fallback to problem count |
| Test 2 | ✓ (core metric) | Tier context loss; need alternate CMDB lookup |
| Test 3 | ✓ (SPOFWatch) | Cascade risk detector unavailable; skip tile |
| Test 4 | ✓ (ObsGaps) | Coverage gaps hidden; skip tile |
| Test 5 | ✓ (MttrTrend) | Trend analysis unavailable; skip tab |
| Test 6 | ✓ (CoreCompute) | Pre/post comparison broken; critical for Crosscheck |

**Minimum viable:** Tests 1, 2, 6 must work. Tests 3, 4, 5 can be optional features.

---

## Next Steps After Testing

1. **All tests pass:** Proceed with implementation Phase 2+
2. **Some tests fail:** Identify failing bizevents/signal sources; may need adjustment
3. **Critical failures:** Escalate to Observability team; may indicate data pipeline issues

Share results, and I'll begin Phase 2: Core Crosscheck Refactor.
