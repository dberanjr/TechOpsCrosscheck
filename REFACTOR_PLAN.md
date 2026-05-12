# TechOps Crosscheck Refactor Plan
## Remove Financial Metrics → User/Dependency-Based Impact

### Current State
- **Metrics removed**: Revenue at Risk ($/day × duration)
- **Data removed**: ServiceNow financial loss rates

### Target Metrics (from Polaris App Insights)

1. **User Impact** → Real users affected by problems
   - Source: `dt.davis.affected_users_count` from Davis problems
   - How: COUNT(problems WHERE affected_users_count > 0) grouped by app

2. **Cascade Risk** → Downstream apps affected by this service
   - Source: Dependency graph (Smartscape 2.0)
   - How: "Blast radius" = distinct consumers of this service
   - Threshold for SPOF: blast >= 5

3. **Observability Gaps** → Apps missing critical instrumentation
   - Source: T1/T2 apps with NO log ingest in last 1-24h
   - High risk if: has active problems + no logs = URGENT
   - Data: Logs lookup, Davis problem correlation

4. **Complexity/Traffic** → Request volume through service
   - Source: Dependency graph request volume
   - How: High volume + active problem = higher impact

5. **Duration & Frequency** → Traditional problem metrics
   - Source: Davis problem duration, MTTR, count
   - Existing implementation, keep as-is

---

## New Pages & Components

### 1. Crosscheck Tab Refactor
**Remove:**
- Revenue Impact column and cards
- Pre/Post financial impact calculations
- ServiceNow lookup overhead

**Add:**
- User Impact (affected users count)
- Cascade Risk (blast radius)
- Observability Gap (coverage status)
- Complexity index (request volume)

**Metric Cards:**
- Pre/Post User Impact (count of affected users)
- Pre/Post Cascade Risk Score (total downstream app risk)
- Pre/Post Observability Gap Count (apps with no logs)
- Avg Duration, MTTR (existing, unchanged)

### 2. New Tile: "Cascade Risk Detector" 
**Copy from Polaris:**
- Top 3 services by blast radius
- Shows downstream app count
- Active problem count
- Request volume

### 3. New Tile: "Observability Coverage Gaps"
**Copy from Polaris logic:**
- T1+T2 apps with no log coverage
- Prioritize by: URGENT (active probs + no logs) > HIGH (T1) > MEDIUM
- Show top 5 with coverage status

### 4. New Tab: "MTTR Trend"
**Copy from Polaris:**
- Line chart of MTTR over time (7d, 30d, 60d, 90d, 180d, 365d ranges)
- Per-app lines with dashed styles
- Logarithmic scale
- MTTR goal line (5 minutes = 0.083 hours)

### 5. New Tab: "Observability Health" 
**From Polaris App Observability Health tab:**
- Full breakdown of all T1+T2 apps:
  - Log coverage status
  - Dependency count
  - SPOF exposure (blast radius)
  - Active problems
  - Last log ingest timestamp
  - Priority recommendations

---

## DQL Queries Needed

### Query 1: Affected Users per App (Pre/Post Window)
```
fetch dt.davis.problems, from:<from_date>
| filter event.kind == "DAVIS_PROBLEM" AND dt.davis.is_duplicate == false
| expand applicationci = ... (extract from tags)
| summarize
    users_affected = countIf(isNotNull(dt.davis.affected_users_count) and dt.davis.affected_users_count > 0),
    users_total = sumIf(dt.davis.affected_users_count)
  by:{appci}
```

### Query 2: Cascade Risk / Blast Radius (Dependency Graph)
```
fetch bizevents, from:-24h
| filter event.type == "workflow.summary.service"
| ... (extract provider/consumer relationships)
| summarize blast_radius = count(distinct downstream_appci)
  by:{provider_appci}
```

### Query 3: Observability Coverage Gaps (T1+T2)
```
fetch bizevents, from:-24h
| filter event.type == "workflow.import.servicenow.appci"
| filter in(tier, {"1 - most critical", "2 - somewhat critical"})
| lookup logs for coverage
| lookup problems for status
| filter has_logs == false
```

### Query 4: MTTR Timeseries per App
```
fetch dt.davis.problems, from:<range>
| filter event.kind == "DAVIS_PROBLEM" ...
| summarize
    avg_mttr_ns = avg(if(event.status == "CLOSED", resolved_problem_duration, null))
  by:{ts = datefloor(timestamp, <interval>), appci}
```

---

## Implementation Order

1. **Phase 1: Understand Data Model**
   - Test DQL queries with dtctl against UAL production
   - Verify Smartscape bizevents are flowing
   - Confirm affected_users_count is populated
   - Check log ingest coverage

2. **Phase 2: Core Crosscheck Refactor**
   - Update `perCiRollup` query to use user impact instead of revenue
   - Remove ServiceNow lookup
   - Add cascade risk metric
   - Update metric cards & tile displays

3. **Phase 3: New Tiles**
   - Build Cascade Risk Detector tile
   - Build Observability Coverage Gaps tile
   - Integrate into existing Home.tsx

4. **Phase 4: New Tabs**
   - Copy & adapt MttrTrend.tsx from Polaris
   - Build Observability Health tab
   - Add routing in Header

5. **Phase 5: Testing & QA**
   - Verify all queries return expected data
   - Test before/after window calculations
   - Validate filter propagation
   - Check performance (query timeout, data volume)

6. **Phase 6: Deploy v1.0.48+**

---

## Key Files to Modify

- `ui/queries/perCiRollup.ts` — Remove revenue, add user impact + cascade risk
- `ui/queries/dailyTimeseries.ts` — Update to affected users instead of revenue
- `ui/queries/topRootCauses.ts` — May need cascade risk context
- `ui/app/pages/Home.tsx` — Update metric cards, add new tiles
- `ui/app/pages/LiveMode.tsx` — Similar changes for real-time view
- `ui/app/components/*.tsx` — Update metric display components
- NEW: `ui/app/pages/MttrTrend.tsx` — Copy from Polaris
- NEW: `ui/app/pages/ObservabilityHealth.tsx` — Build from scratch or adapt
- NEW: `ui/app/pages/insights/CascadeRiskTile.tsx`
- NEW: `ui/app/pages/insights/CoverageGapsTile.tsx`

---

## Questions for User

1. Should Observability Health tab be read-only reporting, or include filters for drill-down?
2. For "Affected Users" — aggregate sum or count of distinct user IDs?
3. Is Smartscape bizevents (`workflow.summary.service`) already flowing at UAL?
4. Should MTTR Trend tab include tier filtering like Crosscheck tab?
5. For "Cascade Risk Score" in pre/post comparison — how to aggregate? (sum of blast radii? median? top N?)

---

## Success Criteria

- [  ] All DQL queries tested and working with dtctl
- [  ] No more financial/revenue metrics in UI
- [  ] User impact metrics displaying correctly
- [  ] Cascade risk detector shows top SPOFs
- [  ] Observability gaps properly flagged
- [  ] MTTR Trend tab functional
- [  ] Observability Health tab comprehensive
- [  ] Live Mode reflects similar changes
- [  ] Landing page updated to reflect new metrics
- [  ] All pages deploy without errors
