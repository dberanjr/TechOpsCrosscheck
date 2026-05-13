import React, { useEffect, useMemo, useRef, useState } from "react";
import { Flex, Grid, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph, Text } from "@dynatrace/strato-components/typography";
import { Chip } from "@dynatrace/strato-components/content";
import Borders from "@dynatrace/strato-design-tokens/borders";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { useDql } from "@dynatrace-sdk/react-hooks";

import { MetricCard } from "../components/MetricCard";
import { TierCard } from "../components/TierCard";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { SourceBanner } from "../components/SourceBanner";
import { UploadTechOpsTableModal } from "../components/UploadTechOpsTableModal";
import { ControlBar } from "../components/ControlBar";
import { PerCiTable, type PerCiRow } from "../components/PerCiTable";
import { PerCiDrilldownSheet } from "../components/PerCiDrilldownSheet";
import { InsightTiles } from "../components/InsightTiles";

import { PermissionRequired } from "../components/PermissionRequired";
import { useNavigate } from "react-router-dom";

import { useCrosscheck } from "../context/CrosscheckContext";
import type { CascadeRiskRow } from "../../queries/cascadeRisk";
import type { CoverageGapsRow } from "../../queries/coverageGaps";
import type { CriticalDependenciesRow } from "../../queries/criticalDependencies";
import type { BlastRadiusCriticalRow } from "../../queries/blastRadiusCritical";
import type { ConcentrationRiskRow } from "../../queries/concentrationRisk";
import type { HighThroughputCriticalRow } from "../../queries/highThroughputCritical";
import type { ActiveProblemsInCriticalRow } from "../../queries/activeProblemsInCritical";
import type { MttrImpactCriticalRow } from "../../queries/mttrImpactCritical";
import {
  recordsToPerCiRows,
  aggregateHeadlines,
  aggregateTiers,
  extractDailySeries,
  effectiveAppCis,
  type DailySeries,
} from "../lib/aggregate";
import { formatUsd, formatNumber, formatMttr, formatDateUtc, formatDateCompact } from "../lib/formatters";
import { APP_VERSION } from "../lib/version";
import { perCiRollupQuery } from "../../queries/perCiRollup";
import { dailyTimeseriesQuery } from "../../queries/dailyTimeseries";
import { topRootCausesQuery, recordsToRootCauses } from "../../queries/topRootCauses";
import type { RootCauseEntry } from "../../queries/topRootCauses";
import { cascadeRiskQuery, recordsToCascadeRisk } from "../../queries/cascadeRisk";
import { coverageGapsQuery, recordsToCoverageGaps } from "../../queries/coverageGaps";
import { criticalDependenciesQuery, recordsToCriticalDependencies } from "../../queries/criticalDependencies";
import { blastRadiusCriticalQuery, recordsToBlastRadiusCritical } from "../../queries/blastRadiusCritical";
import { concentrationRiskQuery, recordsToConcentrationRisk } from "../../queries/concentrationRisk";
import { highThroughputCriticalQuery, recordsToHighThroughputCritical } from "../../queries/highThroughputCritical";
import { activeProblemsInCriticalQuery, recordsToActiveProblemsInCritical } from "../../queries/activeProblemsInCritical";
import { mttrImpactCriticalQuery, recordsToMttrImpactCritical } from "../../queries/mttrImpactCritical";
import { windowRange } from "../../queries/dqlUtils";
import type { WindowRange as WR } from "../../queries/dqlUtils";
import { cisOnDayQuery, recordsToCiSet } from "../../queries/cisOnDay";
import uaGlobePng from "../../assets/ua-globe-data";

export const Home = () => {
  const navigate = useNavigate();
  const {
    pivotIso,
    windowDays,
    appCiFilter,
    tierFilter,
    directorFilter,
    applicationList,
    activeSource,
    centralStatus,
    centralMissingScope,
    refetchCentral,
    setVerdictFilter,
    setTierFilter,
    problemScope,
  } = useCrosscheck();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [drilldownCi, setDrilldownCi] = useState<PerCiRow | null>(null);
  const [selectedRootCause, setSelectedRootCause] = useState<RootCauseEntry | null>(null);
  const [selectedCascadeRisk, setSelectedCascadeRisk] = useState<string | null>(null);
  const [selectedCriticalDep, setSelectedCriticalDep] = useState<string | null>(null);
  const [selectedCoverageGap, setSelectedCoverageGap] = useState<string | null>(null);
  const [selectedBlastRadius, setSelectedBlastRadius] = useState<string | null>(null);
  const [selectedConcentrationRisk, setSelectedConcentrationRisk] = useState<string | null>(null);
  const [selectedHighThroughput, setSelectedHighThroughput] = useState<string | null>(null);
  const [selectedWorstDay, setSelectedWorstDay] = useState<{ key: string; dateIso: string; label: string } | null>(null);

  const handleWorstDaySelect = React.useCallback((key: string, dateIso: string, label: string) => {
    setSelectedWorstDay((prev) => (prev?.key === key ? null : { key, dateIso, label }));
  }, []);

  const handleObsHealthSelect = React.useCallback((appci: string) => {
    navigate(`/obs-health?app=${encodeURIComponent(appci)}`);
  }, [navigate]);

  // Resolve the effective AppCI list every render. When applicationList is
  // empty (no source yet), this is empty and the queries stay disabled.
  const effective = useMemo(
    () => effectiveAppCis(applicationList, tierFilter, directorFilter, appCiFilter),
    [applicationList, tierFilter, directorFilter, appCiFilter],
  );

  const queriesEnabled = effective.length > 0;

  const perCiQueryString = useMemo(
    () =>
      queriesEnabled
        ? perCiRollupQuery({ pivotIso, windowDays, appCiFilter: effective, problemScope })
        : "",
    [pivotIso, windowDays, effective, queriesEnabled, problemScope],
  );
  const dailyQueryString = useMemo(
    () =>
      queriesEnabled
        ? dailyTimeseriesQuery({ pivotIso, windowDays, appCiFilter: effective, problemScope })
        : "",
    [pivotIso, windowDays, effective, queriesEnabled, problemScope],
  );
  const rootCausesQueryString = useMemo(
    () =>
      queriesEnabled
        ? topRootCausesQuery({ pivotIso, windowDays, appCiFilter: effective, problemScope })
        : "",
    [pivotIso, windowDays, effective, queriesEnabled, problemScope],
  );
  const cascadeRiskQueryString = useMemo(
    () =>
      queriesEnabled
        ? cascadeRiskQuery({ pivotIso, windowDays, appCiFilter: effective, problemScope })
        : "",
    [pivotIso, windowDays, effective, queriesEnabled, problemScope],
  );
  const coverageGapsQueryString = useMemo(
    () =>
      queriesEnabled
        ? coverageGapsQuery({ pivotIso, windowDays })
        : "",
    [pivotIso, windowDays, queriesEnabled],
  );
  const criticalDependenciesQueryString = useMemo(
    () =>
      queriesEnabled
        ? criticalDependenciesQuery({ pivotIso, windowDays })
        : "",
    [pivotIso, windowDays, queriesEnabled],
  );
  const blastRadiusCriticalQueryString = useMemo(
    () =>
      queriesEnabled
        ? blastRadiusCriticalQuery({ pivotIso, windowDays })
        : "",
    [pivotIso, windowDays, queriesEnabled],
  );
  const concentrationRiskQueryString = useMemo(
    () =>
      queriesEnabled
        ? concentrationRiskQuery({ pivotIso, windowDays })
        : "",
    [pivotIso, windowDays, queriesEnabled],
  );
  const highThroughputCriticalQueryString = useMemo(
    () =>
      queriesEnabled
        ? highThroughputCriticalQuery({ pivotIso, windowDays })
        : "",
    [pivotIso, windowDays, queriesEnabled],
  );

  const range = useMemo(() => windowRange(pivotIso, windowDays), [pivotIso, windowDays]);
  const dateLabels = useMemo(
    () => ({
      preStart: formatDateCompact(range.preStartIso),
      pivot: formatDateCompact(range.pivotIso),
      postEnd: formatDateCompact(range.postEndIso),
    }),
    [range],
  );

  const dqlExecParams = useMemo(() => ({
    defaultScanLimitGbytes: -1,
    fetchTimeoutSeconds: windowDays > 60 ? 300 : 120,
    requestTimeoutMilliseconds: 60_000,
  }), [windowDays]);

  const perCi = useDql(
    { query: perCiQueryString, ...dqlExecParams },
    { enabled: queriesEnabled },
  );
  const daily = useDql(
    { query: dailyQueryString, ...dqlExecParams },
    { enabled: queriesEnabled },
  );
  const rootCausesResult = useDql(
    { query: rootCausesQueryString, ...dqlExecParams },
    { enabled: queriesEnabled },
  );
  const cascadeRiskResult = useDql(
    { query: cascadeRiskQueryString, ...dqlExecParams },
    { enabled: queriesEnabled },
  );
  const coverageGapsResult = useDql(
    { query: coverageGapsQueryString, ...dqlExecParams },
    { enabled: queriesEnabled },
  );
  const criticalDependenciesResult = useDql(
    { query: criticalDependenciesQueryString, ...dqlExecParams },
    { enabled: queriesEnabled },
  );
  const blastRadiusCriticalResult = useDql(
    { query: blastRadiusCriticalQueryString, ...dqlExecParams },
    { enabled: queriesEnabled },
  );
  const concentrationRiskResult = useDql(
    { query: concentrationRiskQueryString, ...dqlExecParams },
    { enabled: queriesEnabled },
  );
  const highThroughputCriticalResult = useDql(
    { query: highThroughputCriticalQueryString, ...dqlExecParams },
    { enabled: queriesEnabled },
  );

  const worstDayQueryString = useMemo(
    () =>
      selectedWorstDay && queriesEnabled
        ? cisOnDayQuery({ dayStartIso: selectedWorstDay.dateIso, appCiFilter: effective, problemScope })
        : "",
    [selectedWorstDay, effective, queriesEnabled, problemScope],
  );
  const worstDayResult = useDql(
    { query: worstDayQueryString, defaultScanLimitGbytes: -1, requestTimeoutMilliseconds: 60_000 },
    { enabled: Boolean(selectedWorstDay) && queriesEnabled },
  );
  const worstDayCisSet = useMemo(
    () => (selectedWorstDay ? recordsToCiSet(worstDayResult.data?.records) : null),
    [selectedWorstDay, worstDayResult.data?.records],
  );

  // Keep last-known data in refs so tiles show stale values during re-fetches
  // rather than clearing to zero while new data loads.
  const stableRowsRef = useRef<PerCiRow[]>([]);
  const stableSeriesRef = useRef<DailySeries | null>(null);
  const stableRootCausesRef = useRef<RootCauseEntry[]>([]);
  const stableCascadeRiskRef = useRef<CascadeRiskRow[]>([]);
  const stableCoverageGapsRef = useRef<CoverageGapsRow[]>([]);
  const stableCriticalDependenciesRef = useRef<CriticalDependenciesRow[]>([]);
  const stableBlastRadiusCriticalRef = useRef<BlastRadiusCriticalRow[]>([]);
  const stableConcentrationRiskRef = useRef<ConcentrationRiskRow[]>([]);
  const stableHighThroughputCriticalRef = useRef<HighThroughputCriticalRow[]>([]);

  const latestRows = useMemo(
    () => recordsToPerCiRows(perCi.data?.records, applicationList, effective),
    [perCi.data?.records, applicationList, effective],
  );
  const latestSeries = useMemo(
    () => extractDailySeries(daily.data?.records, windowDays),
    [daily.data?.records, windowDays],
  );
  const latestRootCauses = useMemo(
    () => recordsToRootCauses(rootCausesResult.data?.records),
    [rootCausesResult.data?.records],
  );
  const latestCascadeRisk = useMemo(
    () => recordsToCascadeRisk(cascadeRiskResult.data?.records),
    [cascadeRiskResult.data?.records],
  );
  const latestCoverageGaps = useMemo(
    () => recordsToCoverageGaps(coverageGapsResult.data?.records),
    [coverageGapsResult.data?.records],
  );
  const latestCriticalDependencies = useMemo(
    () => recordsToCriticalDependencies(criticalDependenciesResult.data?.records),
    [criticalDependenciesResult.data?.records],
  );
  const latestBlastRadiusCritical = useMemo(
    () => recordsToBlastRadiusCritical(blastRadiusCriticalResult.data?.records),
    [blastRadiusCriticalResult.data?.records],
  );
  const latestConcentrationRisk = useMemo(
    () => recordsToConcentrationRisk(concentrationRiskResult.data?.records),
    [concentrationRiskResult.data?.records],
  );
  const latestHighThroughputCritical = useMemo(
    () => recordsToHighThroughputCritical(highThroughputCriticalResult.data?.records),
    [highThroughputCriticalResult.data?.records],
  );

  useEffect(() => { stableRowsRef.current = latestRows; }, [latestRows]);
  useEffect(() => { stableSeriesRef.current = latestSeries; }, [latestSeries]);
  useEffect(() => { stableRootCausesRef.current = latestRootCauses; }, [latestRootCauses]);
  useEffect(() => { stableCascadeRiskRef.current = latestCascadeRisk; }, [latestCascadeRisk]);
  useEffect(() => { stableCoverageGapsRef.current = latestCoverageGaps; }, [latestCoverageGaps]);
  useEffect(() => { stableCriticalDependenciesRef.current = latestCriticalDependencies; }, [latestCriticalDependencies]);
  useEffect(() => { stableBlastRadiusCriticalRef.current = latestBlastRadiusCritical; }, [latestBlastRadiusCritical]);
  useEffect(() => { stableConcentrationRiskRef.current = latestConcentrationRisk; }, [latestConcentrationRisk]);
  useEffect(() => { stableHighThroughputCriticalRef.current = latestHighThroughputCritical; }, [latestHighThroughputCritical]);

  const displayRows = perCi.isFetching && stableRowsRef.current.length > 0
    ? stableRowsRef.current : latestRows;
  const displaySeries = daily.isFetching && stableSeriesRef.current !== null
    ? stableSeriesRef.current : latestSeries;
  const displayRootCauses = rootCausesResult.isFetching && stableRootCausesRef.current.length > 0
    ? stableRootCausesRef.current : latestRootCauses;
  const displayCascadeRisk = cascadeRiskResult.isFetching && stableCascadeRiskRef.current.length > 0
    ? stableCascadeRiskRef.current : latestCascadeRisk;
  const displayCoverageGaps = coverageGapsResult.isFetching && stableCoverageGapsRef.current.length > 0
    ? stableCoverageGapsRef.current : latestCoverageGaps;

  const filteredCoverageGaps = useMemo(() => {
    return displayCoverageGaps.filter((gap) => {
      if (tierFilter.length > 0 && !tierFilter.includes(gap.tier)) return false;
      if (directorFilter.length > 0 && !directorFilter.includes(gap.app_owner_name)) return false;
      return true;
    });
  }, [displayCoverageGaps, tierFilter, directorFilter]);
  const displayCriticalDependencies = criticalDependenciesResult.isFetching && stableCriticalDependenciesRef.current.length > 0
    ? stableCriticalDependenciesRef.current : latestCriticalDependencies;
  const displayBlastRadiusCritical = blastRadiusCriticalResult.isFetching && stableBlastRadiusCriticalRef.current.length > 0
    ? stableBlastRadiusCriticalRef.current : latestBlastRadiusCritical;
  const displayConcentrationRisk = concentrationRiskResult.isFetching && stableConcentrationRiskRef.current.length > 0
    ? stableConcentrationRiskRef.current : latestConcentrationRisk;
  const displayHighThroughputCritical = highThroughputCriticalResult.isFetching && stableHighThroughputCriticalRef.current.length > 0
    ? stableHighThroughputCriticalRef.current : latestHighThroughputCritical;

  const headlines = useMemo(() => aggregateHeadlines(displayRows), [displayRows]);
  const tiers = useMemo(() => aggregateTiers(displayRows), [displayRows]);

  const filteredRows = useMemo(() => {
    let result = displayRows;

    if (selectedRootCause) {
      const ciSet = new Set(selectedRootCause.cis.map((c) => c.toUpperCase()));
      result = result.filter((r) => ciSet.has(r.singleAppCI.toUpperCase()));
    }

    if (selectedCascadeRisk) {
      result = result.filter((r) => r.singleAppCI.toLowerCase() === selectedCascadeRisk.toLowerCase());
    }

    if (selectedCriticalDep) {
      result = result.filter((r) => r.singleAppCI.toLowerCase() === selectedCriticalDep.toLowerCase());
    }

    if (selectedCoverageGap) {
      result = result.filter((r) => r.singleAppCI.toLowerCase() === selectedCoverageGap.toLowerCase());
    }

    if (selectedBlastRadius) {
      result = result.filter((r) => r.singleAppCI.toLowerCase() === selectedBlastRadius.toLowerCase());
    }

    if (selectedConcentrationRisk) {
      result = result.filter((r) => r.singleAppCI.toLowerCase() === selectedConcentrationRisk.toLowerCase());
    }

    if (selectedHighThroughput) {
      result = result.filter((r) => r.singleAppCI.toLowerCase() === selectedHighThroughput.toLowerCase());
    }

    return result;
  }, [displayRows, selectedRootCause, selectedCascadeRisk, selectedCriticalDep, selectedCoverageGap, selectedBlastRadius, selectedConcentrationRisk, selectedHighThroughput]);

  const rootCauseFilteredRows = filteredRows;

  const worstDays = useMemo((): WorstDaysData | null => {
    if (!displaySeries) return null;
    const { count, affectedUsers, mttrNs, pivotIndex } = displaySeries;
    const pivotMs = new Date(range.pivotIso).getTime();
    const postCount = count.slice(pivotIndex);
    const postAffectedUsers = affectedUsers.slice(pivotIndex);
    const postMttr = mttrNs.slice(pivotIndex);

    let maxCount = 0, maxCountIdx = -1;
    for (let i = 0; i < postCount.length; i++) {
      if (postCount[i] > maxCount) { maxCount = postCount[i]; maxCountIdx = i; }
    }
    let maxAffectedUsers = 0, maxAffectedUsersIdx = -1;
    for (let i = 0; i < postAffectedUsers.length; i++) {
      if (postAffectedUsers[i] > maxAffectedUsers) { maxAffectedUsers = postAffectedUsers[i]; maxAffectedUsersIdx = i; }
    }
    let maxMttr = 0, maxMttrIdx = -1;
    for (let i = 0; i < postMttr.length; i++) {
      if (postCount[i] > 0 && postMttr[i] > maxMttr) { maxMttr = postMttr[i]; maxMttrIdx = i; }
    }

    function toIso(offset: number) { return new Date(pivotMs + offset * 86_400_000).toISOString(); }

    return {
      peakCount: maxCountIdx >= 0 && maxCount > 0 ? { dateIso: toIso(maxCountIdx), value: maxCount } : null,
      peakAffectedUsers: maxAffectedUsersIdx >= 0 && maxAffectedUsers > 0 ? { dateIso: toIso(maxAffectedUsersIdx), value: maxAffectedUsers } : null,
      peakMttr: maxMttrIdx >= 0 && maxMttr > 0 ? { dateIso: toIso(maxMttrIdx), value: maxMttr } : null,
    };
  }, [displaySeries, range]);

  const finalFilteredRows = useMemo(() => {
    if (!worstDayCisSet || worstDayCisSet.size === 0) return rootCauseFilteredRows;
    return rootCauseFilteredRows.filter((r) => worstDayCisSet.has(r.singleAppCI.toLowerCase()));
  }, [rootCauseFilteredRows, worstDayCisSet]);

  // Per-tier CI list for hover tooltips — keyed by tier name, sorted by AppCI
  const tierCiMap = useMemo(() => {
    const map = new Map<string, Array<{ appCi: string; appName: string }>>();
    for (const row of displayRows) {
      if (!row.Tier) continue;
      if (!map.has(row.Tier)) map.set(row.Tier, []);
      map.get(row.Tier)!.push({ appCi: row.singleAppCI, appName: row.ApplicationName ?? "" });
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.appCi.localeCompare(b.appCi));
    }
    return map;
  }, [displayRows]);

  // Page-level permission gate: if both central is denied AND no uploaded
  // table exists, take over the whole page.
  const noSourceAvailable =
    activeSource === null && centralStatus === "permissionDenied";

  if (noSourceAvailable) {
    return (
      <Flex flexDirection="column" padding={24} gap={20}>
        <HeroBanner
          onUploadRequest={() => setUploadOpen(true)}
        />
        <SourceBanner onUploadRequest={() => setUploadOpen(true)} />
        <PermissionRequired
          surface="page"
          scope={centralMissingScope ?? "storage:buckets:read"}
          reason="TechOps Crosscheck cannot load the central application taxonomy. You can request access from the Observability Team or upload a TechOps table to proceed."
          onRetry={refetchCentral}
        />
        <UploadTechOpsTableModal
          show={uploadOpen}
          onDismiss={() => setUploadOpen(false)}
        />
      </Flex>
    );
  }

  const portfolioVerdict =
    headlines.improvedCount > headlines.regressedCount
      ? "improved"
      : headlines.regressedCount > headlines.improvedCount
        ? "regressed"
        : "stable";

  return (
    <Flex flexDirection="column" padding={24} gap={20}>
      <HeroBanner
        onUploadRequest={() => setUploadOpen(true)}
      />

      <SourceBanner onUploadRequest={() => setUploadOpen(true)} />

      <WindowRangeBanner range={range} />

      {!queriesEnabled ? (
        <EmptyHint
          activeSource={activeSource}
          tierFilter={tierFilter}
          directorFilter={directorFilter}
          appCiFilter={appCiFilter}
          applicationListSize={applicationList.length}
        />
      ) : (
        <>
          <Section title="Headline">
            <Grid gridTemplateColumns="repeat(auto-fill, minmax(240px, 1fr))" gap={16}>
              <MetricCard
                label="Affected users"
                pre={headlines.preAffectedUsers}
                post={headlines.postAffectedUsers}
                format={formatNumber}
                sparklineValues={displaySeries?.affectedUsers}
                pivotIndex={displaySeries?.pivotIndex ?? windowDays}
                isLoading={perCi.isFetching || daily.isFetching}
                preStartLabel={dateLabels.preStart}
                pivotLabel={dateLabels.pivot}
                postEndLabel={dateLabels.postEnd}
              />
              <MetricCard
                label="Problem count"
                pre={headlines.preCount}
                post={headlines.postCount}
                format={formatNumber}
                sparklineValues={displaySeries?.count}
                pivotIndex={displaySeries?.pivotIndex ?? windowDays}
                isLoading={perCi.isFetching || daily.isFetching}
                preStartLabel={dateLabels.preStart}
                pivotLabel={dateLabels.pivot}
                postEndLabel={dateLabels.postEnd}
              />
              <MetricCard
                label="Weighted average MTTR"
                pre={headlines.preWeightedMttrNs}
                post={headlines.postWeightedMttrNs}
                format={formatMttr}
                sparklineValues={displaySeries?.mttrNs}
                pivotIndex={displaySeries?.pivotIndex ?? windowDays}
                isLoading={perCi.isFetching || daily.isFetching}
                preStartLabel={dateLabels.preStart}
                pivotLabel={dateLabels.pivot}
                postEndLabel={dateLabels.postEnd}
              />
              <VerdictCard
                verdict={portfolioVerdict}
                improvedCount={headlines.improvedCount}
                regressedCount={headlines.regressedCount}
                newCount={headlines.newCount}
                totalCount={displayRows.length}
                isLoading={perCi.isFetching}
                onClick={() => {
                  if (portfolioVerdict === "improved") setVerdictFilter("improved");
                  else if (portfolioVerdict === "regressed") setVerdictFilter("regressed");
                }}
              />
            </Grid>
          </Section>

          <Section title="Tier rollup">
            <Grid gridTemplateColumns="repeat(auto-fill, minmax(240px, 1fr))" gap={16}>
              {tiers.map((t) => (
                <TierCard
                  key={t.tier}
                  tier={t.tier}
                  ciCount={t.ciCount}
                  mttrPct={t.mttrPct}
                  countPct={t.countPct}
                  affectedUsersPct={t.affectedUsersPct}
                  preMttr={t.preMttr}
                  postMttr={t.postMttr}
                  preCount={t.preCount}
                  postCount={t.postCount}
                  preAffectedUsers={t.preAffectedUsers}
                  postAffectedUsers={t.postAffectedUsers}
                  isLoading={perCi.isFetching}
                  isInactive={tierFilter.length > 0 && !tierFilter.includes(t.tier)}
                  ciList={tierCiMap.get(t.tier)}
                  onClick={() => {
                    const isAlreadyOnly =
                      tierFilter.length === 1 && tierFilter[0] === t.tier;
                    setTierFilter(isAlreadyOnly ? [] : [t.tier]);
                  }}
                />
              ))}
            </Grid>
          </Section>

          <Section title="Insights">
            <InsightTiles
              rows={displayRows}
              rootCauses={displayRootCauses}
              cascadeRisk={displayCascadeRisk}
              criticalDependencies={displayCriticalDependencies}
              coverageGaps={filteredCoverageGaps}
              blastRadiusCritical={displayBlastRadiusCritical}
              concentrationRisk={displayConcentrationRisk}
              highThroughputCritical={displayHighThroughputCritical}
              selectedRootCause={selectedRootCause?.name ?? null}
              selectedCascadeRisk={selectedCascadeRisk}
              selectedCriticalDep={selectedCriticalDep}
              selectedCoverageGap={selectedCoverageGap}
              selectedBlastRadius={selectedBlastRadius}
              selectedConcentrationRisk={selectedConcentrationRisk}
              selectedHighThroughput={selectedHighThroughput}
              onCiSelect={(row) => setDrilldownCi(row)}
              onRootCauseSelect={setSelectedRootCause}
              onCascadeRiskSelect={setSelectedCascadeRisk}
              onCriticalDepSelect={setSelectedCriticalDep}
              onCoverageGapSelect={handleObsHealthSelect}
              onSelectBlastRadius={setSelectedBlastRadius}
              onSelectConcentrationRisk={setSelectedConcentrationRisk}
              onSelectHighThroughput={setSelectedHighThroughput}
            />
            <WorstDaysBanner
              data={worstDays}
              isLoading={daily.isFetching}
              selectedKey={selectedWorstDay?.key ?? null}
              onSelect={handleWorstDaySelect}
            />
          </Section>

          <Section
            title={`Per-CI comparison · ${finalFilteredRows.length}${selectedRootCause || selectedCascadeRisk || selectedCriticalDep || selectedBlastRadius || selectedConcentrationRisk || selectedHighThroughput || selectedWorstDay ? ` of ${displayRows.length}` : ""} CIs`}
            note="Affected Users = sum of real users impacted by problems, aggregated across the pre and post windows. Positive % = more affected users post-pivot (regression)."
            filters={
              <>
                <ActiveFilterBadges />
                {selectedRootCause && (
                  <Chip
                    color="primary"
                    variant="emphasized"
                    size="condensed"
                    onClick={() => setSelectedRootCause(null)}
                  >
                    Root cause: {selectedRootCause.name} ✕
                  </Chip>
                )}
                {selectedCascadeRisk && (
                  <Chip
                    color="primary"
                    variant="emphasized"
                    size="condensed"
                    onClick={() => setSelectedCascadeRisk(null)}
                  >
                    Cascade risk: {selectedCascadeRisk.toUpperCase()} ✕
                  </Chip>
                )}
                {selectedCriticalDep && (
                  <Chip
                    color="primary"
                    variant="emphasized"
                    size="condensed"
                    onClick={() => setSelectedCriticalDep(null)}
                  >
                    Critical dep: {selectedCriticalDep.toUpperCase()} ✕
                  </Chip>
                )}
                {selectedBlastRadius && (
                  <Chip
                    color="primary"
                    variant="emphasized"
                    size="condensed"
                    onClick={() => setSelectedBlastRadius(null)}
                  >
                    Blast radius: {selectedBlastRadius.toUpperCase()} ✕
                  </Chip>
                )}
                {selectedConcentrationRisk && (
                  <Chip
                    color="primary"
                    variant="emphasized"
                    size="condensed"
                    onClick={() => setSelectedConcentrationRisk(null)}
                  >
                    Concentration: {selectedConcentrationRisk.toUpperCase()} ✕
                  </Chip>
                )}
                {selectedHighThroughput && (
                  <Chip
                    color="primary"
                    variant="emphasized"
                    size="condensed"
                    onClick={() => setSelectedHighThroughput(null)}
                  >
                    High throughput: {selectedHighThroughput.toUpperCase()} ✕
                  </Chip>
                )}
                {selectedWorstDay && (
                  <Chip
                    color="primary"
                    variant="emphasized"
                    size="condensed"
                    onClick={() => setSelectedWorstDay(null)}
                  >
                    {selectedWorstDay.label} ✕
                  </Chip>
                )}
              </>
            }
          >
            <PerCiTable
              rows={finalFilteredRows}
              isLoading={perCi.isLoading || worstDayResult.isFetching}
              error={perCi.error}
              onRowSelect={(row) => setDrilldownCi(row)}
              onRefetch={() => void perCi.refetch()}
            />
          </Section>
        </>
      )}

      <MethodologyPanel />

      <Flex justifyContent="flex-end" style={{ paddingTop: 4 }}>
        <Text
          textStyle="small"
          style={{ color: Colors.Text.Neutral.Default, opacity: 0.45 }}
        >
          TechOps Crosscheck · v{APP_VERSION}
        </Text>
      </Flex>

      <PerCiDrilldownSheet
        show={drilldownCi !== null}
        ciId={drilldownCi?.singleAppCI.toLowerCase() ?? null}
        ciName={drilldownCi?.ApplicationName ?? drilldownCi?.singleAppCI ?? null}
        ciRow={drilldownCi}
        problemScope={problemScope}
        initialRootCauseFilter={selectedRootCause?.name ?? null}
        onDismiss={() => setDrilldownCi(null)}
      />
      <UploadTechOpsTableModal
        show={uploadOpen}
        onDismiss={() => setUploadOpen(false)}
      />
    </Flex>
  );
};

interface WorstDayEntry { dateIso: string; value: number; }
interface WorstDaysData {
  peakCount: WorstDayEntry | null;
  peakAffectedUsers: WorstDayEntry | null;
  peakMttr: WorstDayEntry | null;
}

const WORST_DAY_SLOTS = [
  {
    key: "count",
    label: "Peak Problem Day",
    subtitle: "most problems in a single day",
    color: "#1C5BE5",
    bg: "rgba(28,91,229,0.07)",
    format: (v: number) => `${formatNumber(v)} problem${v !== 1 ? "s" : ""}`,
    pick: (d: WorstDaysData) => d.peakCount,
  },
  {
    key: "affectedUsers",
    label: "Peak Impact Day",
    subtitle: "highest single-day affected users",
    color: "#C82D40",
    bg: "rgba(200,45,64,0.07)",
    format: (v: number) => `${formatNumber(v)} user${v !== 1 ? "s" : ""}`,
    pick: (d: WorstDaysData) => d.peakAffectedUsers,
  },
  {
    key: "mttr",
    label: "Worst Outage Day",
    subtitle: "highest avg MTTR across problems",
    color: "#F5A800",
    bg: "rgba(245,168,0,0.07)",
    format: (v: number) => formatMttr(v),
    pick: (d: WorstDaysData) => d.peakMttr,
  },
] as const;

const WorstDaysBanner = ({
  data,
  isLoading,
  selectedKey,
  onSelect,
}: {
  data: WorstDaysData | null;
  isLoading: boolean;
  selectedKey: string | null;
  onSelect: (key: string, dateIso: string, label: string) => void;
}) => {
  const [hoveredSlot, setHoveredSlot] = React.useState<string | null>(null);
  if (!data && !isLoading) return null;
  return (
    <Surface
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: Borders.Radius.Container.Default,
        background: Colors.Background.Surface.Default,
      }}
    >
      {isLoading && <LoadingOverlay />}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        {WORST_DAY_SLOTS.map((slot, i) => {
          const entry = data ? slot.pick(data) : null;
          const isSelected = selectedKey === slot.key;
          const isClickable = Boolean(entry);
          const isHovered = hoveredSlot === slot.key && isClickable;
          return (
            <div
              key={slot.key}
              role={isClickable ? "button" : undefined}
              tabIndex={isClickable ? 0 : undefined}
              onClick={
                isClickable && entry
                  ? () => onSelect(slot.key, entry.dateIso, `${slot.label}: ${formatDateUtc(entry.dateIso)}`)
                  : undefined
              }
              onKeyDown={
                isClickable && entry
                  ? (e) => { if (e.key === "Enter" || e.key === " ") onSelect(slot.key, entry.dateIso, `${slot.label}: ${formatDateUtc(entry.dateIso)}`); }
                  : undefined
              }
              onMouseEnter={() => isClickable && setHoveredSlot(slot.key)}
              onMouseLeave={() => setHoveredSlot(null)}
              style={{
                padding: "12px 18px",
                borderLeft: i > 0 ? "1px solid rgba(128,128,128,0.15)" : undefined,
                background: isSelected ? slot.bg.replace("0.07", "0.14") : entry ? slot.bg : undefined,
                boxShadow: isSelected
                  ? `inset 0 0 0 2px ${slot.color}55`
                  : isHovered
                    ? `inset 0 0 0 1px ${slot.color}44`
                    : undefined,
                cursor: isClickable ? "pointer" : "default",
                transition: "background 150ms, box-shadow 150ms",
                outline: "none",
                transform: isHovered ? "translateY(-1px)" : undefined,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: slot.color,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    lineHeight: 1,
                  }}
                >
                  {slot.label}
                </Text>
                {isSelected && (
                  <Text style={{ fontSize: 9, color: slot.color, opacity: 0.85, fontWeight: 600, lineHeight: 1 }}>
                    · Filtering table ↓
                  </Text>
                )}
              </div>
              <Text
                style={{
                  fontSize: 10,
                  color: Colors.Text.Neutral.Default,
                  opacity: 0.5,
                  display: "block",
                  marginBottom: 6,
                }}
              >
                Post window · {slot.subtitle}
              </Text>
              {entry ? (
                <>
                  <Text style={{ fontSize: 14, fontWeight: 700, color: Colors.Text.Neutral.Default, display: "block" }}>
                    {formatDateUtc(entry.dateIso)}
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: 600, color: slot.color, display: "block", marginTop: 1 }}>
                    {slot.format(entry.value)}
                  </Text>
                </>
              ) : (
                <Text style={{ fontSize: 12, color: Colors.Text.Neutral.Default, opacity: 0.35, display: "block" }}>
                  No post-window data
                </Text>
              )}
            </div>
          );
        })}
      </div>
    </Surface>
  );
};

const WindowRangeBanner = ({ range }: { range: WR }) => (
  <Flex
    alignItems="center"
    gap={8}
    flexFlow="wrap"
    style={{
      padding: "7px 14px 7px 12px",
      borderRadius: 6,
      background: Colors.Background.Surface.Default,
      borderLeft: "3px solid #003087",
      fontSize: 11,
      lineHeight: 1.4,
    }}
  >
    <span style={{ color: "#1C5BE5", fontWeight: 700 }}>Pre</span>
    <span style={{ color: Colors.Text.Neutral.Default, opacity: 0.75 }}>
      {formatDateUtc(range.preStartIso)} – {formatDateUtc(range.pivotIso)}
    </span>
    <span style={{ color: Colors.Text.Neutral.Default, opacity: 0.25, margin: "0 6px" }}>|</span>
    <span style={{ color: "#555", fontWeight: 700 }}>Pivot</span>
    <span style={{ color: Colors.Text.Neutral.Default, opacity: 0.75 }}>
      {formatDateUtc(range.pivotIso)}
    </span>
    <span style={{ color: Colors.Text.Neutral.Default, opacity: 0.25, margin: "0 6px" }}>|</span>
    <span style={{ color: "#C82D40", fontWeight: 700 }}>Post</span>
    <span style={{ color: Colors.Text.Neutral.Default, opacity: 0.75 }}>
      {formatDateUtc(range.pivotIso)} – {formatDateUtc(range.postEndIso)}
    </span>
  </Flex>
);

// VerdictCard is a custom card variant for the "Portfolio verdict" headline
// slot. It doesn't fit the MetricCard pre/post numeric pattern, so we render
// our own small surface here.
const VerdictCard = ({
  verdict,
  improvedCount,
  regressedCount,
  newCount,
  totalCount,
  isLoading = false,
  onClick,
}: {
  verdict: "improved" | "regressed" | "stable";
  improvedCount: number;
  regressedCount: number;
  newCount: number;
  totalCount: number;
  isLoading?: boolean;
  onClick?: () => void;
}) => {
  const [hovered, setHovered] = React.useState(false);
  const color =
    verdict === "improved"
      ? "#73BE28"
      : verdict === "regressed"
        ? "#C82D40"
        : Colors.Text.Neutral.Default;
  const label =
    verdict === "improved"
      ? "Improved"
      : verdict === "regressed"
        ? "Regressed"
        : "Mixed";
  return (
    <Surface
      as={onClick ? "button" : "div"}
      onClick={onClick}
      aria-label="Portfolio verdict"
      onMouseEnter={() => onClick && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 16,
        borderRadius: Borders.Radius.Container.Default,
        background: Colors.Background.Surface.Default,
        cursor: onClick ? "pointer" : "default",
        textAlign: "left",
        border: "none",
        width: "100%",
        transition: "box-shadow 0.15s ease, transform 0.15s ease",
        boxShadow: hovered && onClick ? "0 4px 16px rgba(0,0,0,0.18)" : undefined,
        transform: hovered && onClick ? "translateY(-1px)" : undefined,
      }}
    >
      {isLoading && <LoadingOverlay />}
      <Text textStyle="small-emphasized" style={{ color: Colors.Text.Neutral.Default }}>
        Portfolio verdict
      </Text>
      <Heading level={3} style={{ margin: 0, color }}>
        {label}
      </Heading>
      <Flex flexDirection="column" gap={2}>
        <Text textStyle="small">
          {improvedCount} improved · {regressedCount} regressed · {newCount} new
        </Text>
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default }}>
          across {totalCount} CIs
        </Text>
      </Flex>
    </Surface>
  );
};

const UABrandMark = () => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
    <img
      src={uaGlobePng}
      alt="United Airlines logo"
      style={{
        width: 60,
        height: 60,
        objectFit: "contain",
        display: "block",
        flexShrink: 0,
      }}
    />
  </div>
);

const HeroBanner = ({
  onUploadRequest,
}: {
  onUploadRequest: () => void;
}) => (
  <div
    style={{
      borderRadius: 10,
      overflow: "hidden",
      boxShadow: "0 6px 32px rgba(0,24,72,0.32), 0 1px 4px rgba(0,24,72,0.18)",
    }}
  >
    {/* Branded header */}
    <div
      style={{
        background: "linear-gradient(135deg, #001848 0%, #003087 52%, #0050A8 100%)",
        padding: "22px 28px 20px",
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 22,
      }}
    >
      <UABrandMark />
      <div
        style={{
          width: 1,
          alignSelf: "stretch",
          background: "rgba(255,255,255,0.18)",
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: "#fff",
            fontSize: 23,
            fontWeight: 800,
            letterSpacing: "-0.4px",
            lineHeight: 1.15,
          }}
        >
          TechOps Crosscheck
        </div>
        <div
          style={{
            color: "rgba(255,255,255,0.62)",
            fontSize: 12,
            marginTop: 7,
            lineHeight: 1.65,
            maxWidth: 580,
          }}
        >
          Before-and-after analysis of problem counts, MTTR, and affected users
          across your application portfolio. Set a pivot date to verify that a change improved
          reliability, or to surface regressions for leadership reporting.
        </div>
      </div>
    </div>
    {/* Filter bar — light background, visually flush below the branded header */}
    <ControlBar onUploadRequest={onUploadRequest} />
  </div>
);

const MethodologyPanel = () => (
  <div
    style={{
      borderRadius: 8,
      border: "1px solid rgba(128,128,128,0.15)",
      background: Colors.Background.Surface.Default,
      padding: "20px 24px",
      display: "flex",
      flexDirection: "column",
      gap: 20,
    }}
  >
    <div style={{ paddingLeft: 10, borderLeft: "3px solid rgba(128,128,128,0.3)" }}>
      <Text
        textStyle="small-emphasized"
        style={{ color: Colors.Text.Neutral.Default, opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 10 }}
      >
        Methodology
      </Text>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 24 }}>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Text textStyle="small-emphasized" style={{ color: Colors.Text.Neutral.Default, opacity: 0.75 }}>
          Problems vs. Alerts
        </Text>
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.55, lineHeight: 1.6 }}>
          An <strong>Alert</strong> in Dynatrace is a single threshold notification — a metric crossed a boundary (e.g., CPU &gt; 80%). A <strong>Problem</strong> is Davis AI&apos;s correlation of one or more alerts into a single actionable incident with automatic root cause identification. Problems persist until all contributing conditions resolve. TechOps Crosscheck counts and measures Problems, so a single outage affecting multiple components appears as one Problem, not many raw alerts.
        </Text>
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.55, lineHeight: 1.6, marginTop: 4 }}>
          The <strong>Problem type</strong> filter in the control bar determines which events are included in the analysis:
        </Text>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 2 }}>
          {[
            {
              label: "Business impacting",
              body: "Focuses on true end-user–affecting outages confirmed by Davis AI. This is the most accurate signal for assessing reliability impact and is the recommended default.",
            },
            {
              label: "Operational",
              body: "Includes Problems plus operational alerts, while filtering out the noisiest / most frequent low-signal alerts. Broadens coverage but may reduce accuracy as some non-impacting events are included.",
            },
            {
              label: "All",
              body: "Includes all Alerts and Problems with no filtering. Provides the widest view but can significantly inflate counts and MTTR with noisy, low-severity events, making the before/after comparison less accurate.",
            },
          ].map(({ label, body }) => (
            <div key={label} style={{ display: "flex", gap: 8 }}>
              <span style={{ flexShrink: 0, color: Colors.Text.Neutral.Default, opacity: 0.4, fontSize: 11, marginTop: 1 }}>·</span>
              <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.55, lineHeight: 1.6 }}>
                <strong>{label}</strong> — {body}
              </Text>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Text textStyle="small-emphasized" style={{ color: Colors.Text.Neutral.Default, opacity: 0.75 }}>
          MTTR — Mean Time To Resolve
        </Text>
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.55, lineHeight: 1.6 }}>
          MTTR is the average duration from when a Problem is opened to when it is resolved, measured internally in nanoseconds and displayed as days / hours / minutes / seconds. Pre and post averages are weighted by problem count per CI, then summed across all CIs in a tier for the tier rollup cards. <strong>Lower MTTR = faster resolution.</strong> A positive % means slower resolution post-pivot (regression, shown in red).
        </Text>
        <div
          style={{
            marginTop: 6,
            padding: "8px 12px",
            borderRadius: 5,
            background: "rgba(245,168,0,0.09)",
            borderLeft: "3px solid rgba(245,168,0,0.55)",
          }}
        >
          <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.65, lineHeight: 1.6 }}>
            <strong>Note:</strong> Dynatrace&apos;s MTTR calculation may differ from United Airlines&apos; internal definition of MTTR. Dynatrace measures the end-to-end open-to-close duration of a correlated Problem entity, which may encompass multiple underlying alerts and component failures. UA&apos;s MTTR definition should be validated against this methodology before using these figures for formal SLA or incident reporting.
          </Text>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Text textStyle="small-emphasized" style={{ color: Colors.Text.Neutral.Default, opacity: 0.75 }}>
          Affected Users
        </Text>
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.55, lineHeight: 1.6 }}>
          Affected users is the sum of real users impacted by problems, extracted from Dynatrace Davis AI correlation data. This metric quantifies the business impact in terms of user-facing outages rather than estimated financial loss.
        </Text>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 4 }}>
          {[
            {
              n: "1",
              title: "Per-problem user count",
              body: "Dynatrace Davis AI calculates dt.davis.affected_users_count for each correlated Problem, representing the number of real users impacted by that outage.",
            },
            {
              n: "2",
              title: "Problem-level aggregation",
              body: "For each problem, we extract affected_users_count. If no users were affected (field is null), the count is zero.",
            },
            {
              n: "3",
              title: "Pre / post totals",
              body: "Problems are split into pre-pivot and post-pivot windows. preAffectedUsers and postAffectedUsers are the sums of affected user counts across all CIs in the tier for each window.",
            },
            {
              n: "4",
              title: "Percentage change",
              body: "Standard ((post − pre) / pre) × 100. If pre was 0 and post > 0, it shows ∞ (new emergence). Reflects whether affected users increased or decreased post-pivot.",
            },
          ].map(({ n, title, body }) => (
            <div key={n} style={{ display: "flex", gap: 8 }}>
              <span
                style={{
                  flexShrink: 0,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "rgba(128,128,128,0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 700,
                  color: Colors.Text.Neutral.Default,
                  opacity: 0.6,
                  marginTop: 1,
                }}
              >
                {n}
              </span>
              <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.55, lineHeight: 1.6 }}>
                <strong>{title}</strong> — {body}
              </Text>
            </div>
          ))}
        </div>
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.55, lineHeight: 1.6, marginTop: 4 }}>
          A <strong>positive % in Impact means more financial loss post-pivot</strong> (regression, shown in red) — same lower-is-better logic as MTTR and Count.
        </Text>
      </div>

    </div>
  </div>
);

const Section = ({
  title,
  note,
  filters,
  children,
}: {
  title: string;
  note?: string;
  filters?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <Flex flexDirection="column" gap={12}>
    <div>
      <Flex
        alignItems="center"
        gap={8}
        flexFlow="wrap"
        style={{ paddingLeft: 10, borderLeft: "3px solid #003087" }}
      >
        <Heading level={3} style={{ margin: 0 }}>
          {title}
        </Heading>
        {filters}
      </Flex>
      {note && (
        <div style={{ paddingLeft: 13, marginTop: 5 }}>
          <Text
            textStyle="small"
            style={{ color: Colors.Text.Neutral.Default, opacity: 0.6, lineHeight: 1.5 }}
          >
            {note}
          </Text>
        </div>
      )}
    </div>
    {children}
  </Flex>
);

// Renders a chip per active filter category (director, tier, CI).
// Shows nothing when no filters are active.
const ActiveFilterBadges = () => {
  const { tierFilter, directorFilter, appCiFilter } = useCrosscheck();

  const badges: { key: string; label: string; values: ReadonlyArray<string> }[] = [
    { key: "tier", label: "Tier", values: tierFilter },
    { key: "dir", label: "Director", values: directorFilter },
    { key: "ci", label: "CI", values: appCiFilter },
  ];

  return (
    <>
      {badges.map(({ key, label, values }) => {
        if (values.length === 0) return null;
        const display =
          values.length <= 2
            ? values.join(", ")
            : `${values[0]}, ${values[1]} +${values.length - 2}`;
        return (
          <Chip key={key} color="primary" variant="emphasized" size="condensed">
            {label}: {display}
          </Chip>
        );
      })}
    </>
  );
};

const EmptyHint = ({
  activeSource,
  tierFilter,
  directorFilter,
  appCiFilter,
  applicationListSize,
}: {
  activeSource: string | null;
  tierFilter: ReadonlyArray<string>;
  directorFilter: ReadonlyArray<string>;
  appCiFilter: ReadonlyArray<string>;
  applicationListSize: number;
}) => {
  const hasAnyFilter =
    tierFilter.length > 0 || directorFilter.length > 0 || appCiFilter.length > 0;
  return (
    <Flex flexDirection="column" gap={8} padding={32}>
      {activeSource === null ? (
        <Paragraph>
          Waiting for a TechOps application source. Upload a table or wait for the
          central lookup.
        </Paragraph>
      ) : hasAnyFilter ? (
        <Paragraph>
          The current filters match no CIs in the {applicationListSize}-row
          application list. Adjust the tier, director, or AppCI filters to see
          results.
        </Paragraph>
      ) : (
        <Paragraph>
          The active source returned no CIs. Try refetching or uploading a
          different table.
        </Paragraph>
      )}
    </Flex>
  );
};

