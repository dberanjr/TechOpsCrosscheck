import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Flex, Grid, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import Borders from "@dynatrace/strato-design-tokens/borders";
import type { PerCiRow } from "./PerCiTable";
import type { RootCauseEntry } from "../../queries/topRootCauses";
import type { CascadeRiskRow } from "../../queries/cascadeRisk";
import type { CoverageGapsRow } from "../../queries/coverageGaps";
import type { CriticalDependenciesRow } from "../../queries/criticalDependencies";
import type { BlastRadiusCriticalRow } from "../../queries/blastRadiusCritical";
import type { ConcentrationRiskRow } from "../../queries/concentrationRisk";
import type { HighThroughputCriticalRow } from "../../queries/highThroughputCritical";
import { formatMttr, formatNumber } from "../lib/formatters";
import { improvementGreen, regressionRed } from "../lib/colors";

const AMBER = "#F5A800";
const PURPLE = "#7C38A0";
const DT_BLUE = "#1496FF";

export interface InsightTilesProps {
  rows: ReadonlyArray<PerCiRow>;
  rootCauses: ReadonlyArray<RootCauseEntry>;
  cascadeRisk: ReadonlyArray<CascadeRiskRow>;
  criticalDependencies: ReadonlyArray<CriticalDependenciesRow>;
  coverageGaps: ReadonlyArray<CoverageGapsRow>;
  blastRadiusCritical: ReadonlyArray<BlastRadiusCriticalRow>;
  concentrationRisk: ReadonlyArray<ConcentrationRiskRow>;
  highThroughputCritical: ReadonlyArray<HighThroughputCriticalRow>;
  selectedRootCause: string | null;
  selectedCascadeRisk: string | null;
  selectedCriticalDep: string | null;
  selectedCoverageGap: string | null;
  selectedBlastRadius: string | null;
  selectedConcentrationRisk: string | null;
  selectedHighThroughput: string | null;
  onCiSelect: (row: PerCiRow) => void;
  onRootCauseSelect: (rc: RootCauseEntry | null) => void;
  onCascadeRiskSelect: (appci: string | null) => void;
  onCriticalDepSelect: (appci: string | null) => void;
  onCoverageGapSelect: (appci: string | null) => void;
  onSelectBlastRadius: (appci: string | null) => void;
  onSelectConcentrationRisk: (appci: string | null) => void;
  onSelectHighThroughput: (appci: string | null) => void;
}

interface CiEntry {
  row: PerCiRow;
  stat: string;
  statLabel?: string;
}

const RankBadge = ({ rank, color }: { rank: number; color: string }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 20,
      height: 20,
      borderRadius: "50%",
      background: color,
      color: "#fff",
      fontSize: 10,
      fontWeight: 700,
      flexShrink: 0,
    }}
  >
    {rank}
  </span>
);

const CiButton = ({
  entry,
  accentColor,
  rank,
  onSelect,
}: {
  entry: CiEntry;
  accentColor: string;
  rank: number;
  onSelect: (row: PerCiRow) => void;
}) => (
  <button
    onClick={() => onSelect(entry.row)}
    style={{
      display: "flex",
      alignItems: "flex-start",
      padding: "7px 14px",
      background: "transparent",
      border: "none",
      cursor: "pointer",
      textAlign: "left",
      width: "100%",
      gap: 10,
      transition: "background 120ms",
    }}
    onMouseEnter={(e) => {
      (e.currentTarget as HTMLButtonElement).style.background = "rgba(128,128,128,0.09)";
    }}
    onMouseLeave={(e) => {
      (e.currentTarget as HTMLButtonElement).style.background = "transparent";
    }}
  >
    <RankBadge rank={rank} color={accentColor} />
    <div style={{ minWidth: 0, flex: 1 }}>
      {/* Row 1: short CI code (left) + stat value with label (right, fixed) */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
        <Text
          textStyle="small-emphasized"
          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}
        >
          {entry.row.singleAppCI}
        </Text>
        <span style={{ display: "flex", alignItems: "baseline", gap: 3, flexShrink: 0 }}>
          <Text
            textStyle="small-emphasized"
            style={{ color: accentColor, fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}
          >
            {entry.stat}
          </Text>
          {entry.statLabel && (
            <Text
              textStyle="small"
              style={{ color: Colors.Text.Neutral.Default, opacity: 0.4, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.5px" }}
            >
              {entry.statLabel}
            </Text>
          )}
        </span>
      </div>
      {/* Row 2: full app name, no competing right-side element */}
      {(entry.row.ApplicationName || entry.row.ciname) && (
        <Text
          textStyle="small"
          style={{
            color: Colors.Text.Neutral.Default,
            opacity: 0.5,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: 10,
            display: "block",
            marginTop: 1,
          }}
        >
          {entry.row.ApplicationName ?? entry.row.ciname}
        </Text>
      )}
    </div>
  </button>
);

const InsightTile = ({
  title,
  subtitle,
  heroValue,
  heroLabel,
  accentColor,
  gradientFrom,
  gradientTo,
  entries,
  emptyMsg,
  description,
  onSelect,
}: {
  title: string;
  subtitle: string;
  heroValue: string;
  heroLabel: string;
  accentColor: string;
  gradientFrom: string;
  gradientTo: string;
  entries: CiEntry[];
  emptyMsg: string;
  description?: string;
  onSelect: (row: PerCiRow) => void;
}) => (
  <Surface
    style={{
      display: "flex",
      flexDirection: "column",
      borderRadius: Borders.Radius.Container.Default,
      background: Colors.Background.Surface.Default,
      overflow: "hidden",
      minHeight: 180,
      border: `1px solid ${accentColor}22`,
    }}
  >
    {/* Gradient header with hero stat */}
    <div
      style={{
        background: `linear-gradient(135deg, ${gradientFrom} 0%, ${gradientTo} 100%)`,
        padding: "14px 16px 12px",
      }}
    >
      <Flex justifyContent="space-between" alignItems="flex-start" gap={8}>
        <Flex flexDirection="column" gap={2} style={{ minWidth: 0, flex: 1 }}>
          <Text textStyle="small-emphasized" style={{ color: "#fff", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.6px", opacity: 0.9, lineHeight: 1.3 }}>
            {title}
          </Text>
          <Text textStyle="small" style={{ color: "#fff", opacity: 0.7, fontSize: 10, lineHeight: 1.3 }}>
            {subtitle}
          </Text>
        </Flex>
        <Flex flexDirection="column" alignItems="flex-end" gap={0} style={{ flexShrink: 0, minWidth: 0, maxWidth: "45%" }}>
          <Text style={{ color: "#fff", fontSize: "clamp(16px, 5vw, 24px)", fontWeight: 700, lineHeight: 1, wordBreak: "break-word" }}>
            {heroValue}
          </Text>
          <Text style={{ color: "#fff", opacity: 0.7, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            {heroLabel}
          </Text>
        </Flex>
      </Flex>
    </div>

    {/* Entries list */}
    <Flex flexDirection="column" gap={0} style={{ padding: "4px 0 6px", flex: 1 }}>
      {entries.length === 0 ? (
        <Text
          textStyle="small"
          style={{ color: Colors.Text.Neutral.Default, opacity: 0.45, padding: "12px 14px" }}
        >
          {emptyMsg}
        </Text>
      ) : (
        entries.map(({ row, stat, statLabel }, i) => (
          <CiButton
            key={row.singleAppCI}
            entry={{ row, stat, statLabel }}
            accentColor={accentColor}
            rank={i + 1}
            onSelect={onSelect}
          />
        ))
      )}
    </Flex>
    {description && (
      <Text
        textStyle="small"
        style={{
          color: Colors.Text.Neutral.Default,
          opacity: 0.5,
          fontSize: 9,
          padding: "6px 14px 8px",
          borderTop: "1px solid rgba(128,128,128,0.15)",
          lineHeight: 1.4,
        }}
      >
        {description}
      </Text>
    )}
  </Surface>
);

const RootCauseTile = ({
  rootCauses,
  selectedRootCause,
  onRootCauseSelect,
}: {
  rootCauses: ReadonlyArray<RootCauseEntry>;
  selectedRootCause: string | null;
  onRootCauseSelect: (rc: RootCauseEntry | null) => void;
}) => {
  const top5 = rootCauses.slice(0, 5);
  const totalProblems = rootCauses.reduce((sum, rc) => sum + rc.count, 0);
  const uniqueCiCount = new Set(rootCauses.flatMap((rc) => rc.cis)).size;

  return (
    <Surface
      style={{
        display: "flex",
        flexDirection: "column",
        borderRadius: Borders.Radius.Container.Default,
        background: Colors.Background.Surface.Default,
        overflow: "hidden",
        minHeight: 180,
        border: `1px solid ${DT_BLUE}22`,
      }}
    >
      <div
        style={{
          background: `linear-gradient(135deg, #0B6BC9 0%, ${DT_BLUE} 100%)`,
          padding: "14px 16px 12px",
        }}
      >
        <Flex justifyContent="space-between" alignItems="flex-start" gap={8}>
          <Flex flexDirection="column" gap={2} style={{ minWidth: 0, flex: 1 }}>
            <Text textStyle="small-emphasized" style={{ color: "#fff", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.6px", opacity: 0.9, lineHeight: 1.3 }}>
              Top Root Causes
            </Text>
            <Text textStyle="small" style={{ color: "#fff", opacity: 0.7, fontSize: 10, lineHeight: 1.3 }}>
              {selectedRootCause ? "Filtering table ↓" : "Most frequent in post window"}
            </Text>
          </Flex>
          <Flex flexDirection="column" alignItems="flex-end" gap={0} style={{ flexShrink: 0, minWidth: 0, maxWidth: "45%" }}>
            <Text style={{ color: "#fff", fontSize: "clamp(16px, 5vw, 24px)", fontWeight: 700, lineHeight: 1, wordBreak: "break-word" }}>
              {formatNumber(totalProblems)}
            </Text>
            <Text style={{ color: "#fff", opacity: 0.7, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              problems
            </Text>
            <Text style={{ color: "#fff", opacity: 0.7, fontSize: 9, letterSpacing: "0.3px", marginTop: 2 }}>
              {uniqueCiCount} CIs impacted
            </Text>
          </Flex>
        </Flex>
      </div>
      <Flex flexDirection="column" gap={0} style={{ padding: "4px 0 6px", flex: 1 }}>
        {top5.length === 0 ? (
          <Text
            textStyle="small"
            style={{ color: Colors.Text.Neutral.Default, opacity: 0.45, padding: "12px 14px" }}
          >
            No root cause data available
          </Text>
        ) : (
          top5.map((rc, i) => {
            const isActive = selectedRootCause === rc.name;
            return (
              <button
                key={rc.name}
                onClick={() => onRootCauseSelect(isActive ? null : rc)}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "7px 14px",
                  background: isActive ? `${DT_BLUE}18` : "transparent",
                  border: "none",
                  borderLeft: isActive ? `3px solid ${DT_BLUE}` : "3px solid transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                  transition: "background 120ms",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "rgba(128,128,128,0.07)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                }}
              >
                <RankBadge rank={i + 1} color={isActive ? DT_BLUE : `${DT_BLUE}88`} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  {/* Row 1: RC name (left) + problem count + label (right, fixed) */}
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
                    <Text
                      textStyle="small-emphasized"
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        minWidth: 0,
                        color: isActive ? DT_BLUE : undefined,
                      }}
                    >
                      {rc.name}
                    </Text>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 3, flexShrink: 0 }}>
                      <Text
                        textStyle="small-emphasized"
                        style={{ color: isActive ? DT_BLUE : Colors.Text.Neutral.Default, fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}
                      >
                        {formatNumber(rc.count)}
                      </Text>
                      <Text
                        textStyle="small"
                        style={{ color: Colors.Text.Neutral.Default, opacity: 0.4, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.5px" }}
                      >
                        problems
                      </Text>
                    </span>
                  </div>
                  {/* Row 2: CI count, full width */}
                  <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.5, fontSize: 10, display: "block", marginTop: 1 }}>
                    {rc.cis.length} CI{rc.cis.length !== 1 ? "s" : ""}
                  </Text>
                </div>
              </button>
            );
          })
        )}
      </Flex>
      <Text
        textStyle="small"
        style={{
          color: Colors.Text.Neutral.Default,
          opacity: 0.5,
          fontSize: 9,
          padding: "6px 14px 8px",
          borderTop: "1px solid rgba(128,128,128,0.15)",
          lineHeight: 1.4,
        }}
      >
        Event patterns causing the most problems in the post window. Click to filter the table to CIs affected by this root cause.
      </Text>
    </Surface>
  );
};

export const InsightTiles = ({ rows, rootCauses, cascadeRisk, criticalDependencies, coverageGaps, blastRadiusCritical, concentrationRisk, highThroughputCritical, selectedRootCause, selectedCascadeRisk, selectedCriticalDep, selectedCoverageGap, selectedBlastRadius, selectedConcentrationRisk, selectedHighThroughput, onCiSelect, onRootCauseSelect, onCascadeRiskSelect, onCriticalDepSelect, onCoverageGapSelect, onSelectBlastRadius, onSelectConcentrationRisk, onSelectHighThroughput }: InsightTilesProps) => {
  const heroes = useMemo(() => {
    return rows
      .filter((r) => r.postCount === 0 && r.preCount > 0)
      .sort((a, b) => b.preCount - a.preCount)
      .slice(0, 5)
      .map((row) => ({
        row,
        stat: `${row.preCount} → 0`,
        statLabel: "cleared",
      }));
  }, [rows]);

  const topMttr = useMemo(() => {
    return rows
      .filter((r) => r.postMTTR_ns !== null && r.postMTTR_ns > 0)
      .sort((a, b) => (b.postMTTR_ns ?? 0) - (a.postMTTR_ns ?? 0))
      .slice(0, 5)
      .map((row) => ({
        row,
        stat: formatMttr(row.postMTTR_ns),
        statLabel: "avg MTTR",
      }));
  }, [rows]);

  const topAffectedUsers = useMemo(() => {
    return rows
      .filter((r) => r.postAffectedUsers > 0)
      .sort((a, b) => b.postAffectedUsers - a.postAffectedUsers)
      .slice(0, 5)
      .map((row) => ({
        row,
        stat: formatNumber(row.postAffectedUsers),
        statLabel: "affected users",
      }));
  }, [rows]);

  const topProblems = useMemo(() => {
    return rows
      .filter((r) => r.postCount > 0)
      .sort((a, b) => b.postCount - a.postCount)
      .slice(0, 5)
      .map((row) => ({
        row,
        stat: formatNumber(row.postCount),
        statLabel: "problems",
      }));
  }, [rows]);

  const heroCount = heroes.length;
  const totalCleared = heroes.reduce((sum, h) => sum + h.row.preCount, 0);

  return (
    <Grid gridTemplateColumns="repeat(auto-fill, minmax(240px, 1fr))" gap={16}>
      <InsightTile
        title="Zero-Problem Heroes"
        subtitle="Cleared all problems in post window"
        heroValue={String(heroCount)}
        heroLabel={`CIs · ${totalCleared} cleared`}
        accentColor={improvementGreen}
        gradientFrom="#4A8A15"
        gradientTo="#73BE28"
        entries={heroes}
        emptyMsg="No CIs fully cleared yet"
        description="Apps that resolved all problems post-pivot. Demonstrates progress and effective incident response."
        onSelect={onCiSelect}
      />
      <InsightTile
        title="Slowest to Resolve"
        subtitle="Highest avg MTTR in post window"
        heroValue={topMttr.length > 0 ? formatMttr(topMttr[0].row.postMTTR_ns) : "—"}
        heroLabel="worst MTTR"
        accentColor={AMBER}
        gradientFrom="#C48800"
        gradientTo="#F5A800"
        entries={topMttr}
        emptyMsg="No post-window MTTR data"
        description="Apps with longest resolution time. Focus area for SRE process improvements and incident response optimization."
        onSelect={onCiSelect}
      />
      <InsightTile
        title="Most Impacted"
        subtitle="Highest affected users (post)"
        heroValue={topAffectedUsers.length > 0 ? formatNumber(topAffectedUsers[0].row.postAffectedUsers) : "—"}
        heroLabel="users impacted"
        accentColor={regressionRed}
        gradientFrom="#9A1E30"
        gradientTo="#C82D40"
        entries={topAffectedUsers}
        emptyMsg="No user impact data"
        description="Apps causing the most user impact. Prioritize reliability improvements to reduce blast radius."
        onSelect={onCiSelect}
      />
      <InsightTile
        title="Most Active"
        subtitle="Highest problem count in post window"
        heroValue={topProblems.length > 0 ? formatNumber(topProblems[0].row.postCount) : "—"}
        heroLabel="top count"
        accentColor={PURPLE}
        gradientFrom="#5A2878"
        gradientTo="#7C38A0"
        entries={topProblems}
        emptyMsg="No post-window problems"
        description="Apps with the most problems detected. High volume indicates stability issues or high observability coverage."
        onSelect={onCiSelect}
      />
      <RootCauseTile
        rootCauses={rootCauses}
        selectedRootCause={selectedRootCause}
        onRootCauseSelect={onRootCauseSelect}
      />
      <CascadeRiskTile cascadeRisk={cascadeRisk} selectedCascadeRisk={selectedCascadeRisk} onSelect={onCascadeRiskSelect} />
      <MostCriticalTile criticalDependencies={criticalDependencies} selectedCriticalDep={selectedCriticalDep} onSelect={onCriticalDepSelect} />
      <CoverageGapsTile coverageGaps={coverageGaps} selectedCoverageGap={selectedCoverageGap} onSelect={onCoverageGapSelect} />
      <BlastRadiusCriticalTile blastRadiusCritical={blastRadiusCritical} selectedBlastRadius={selectedBlastRadius} onSelect={onSelectBlastRadius} />
      <ConcentrationRiskTile concentrationRisk={concentrationRisk} selectedConcentrationRisk={selectedConcentrationRisk} onSelect={onSelectConcentrationRisk} />
      <HighThroughputCriticalTile highThroughputCritical={highThroughputCritical} selectedHighThroughput={selectedHighThroughput} onSelect={onSelectHighThroughput} />
    </Grid>
  );
};

const CascadeRiskTile = ({ cascadeRisk, selectedCascadeRisk, onSelect }: { cascadeRisk: ReadonlyArray<CascadeRiskRow>; selectedCascadeRisk: string | null; onSelect: (appci: string | null) => void }) => {
  const top5 = cascadeRisk.slice(0, 5);
  const maxBlastRadius = cascadeRisk.length > 0 ? cascadeRisk[0].distinct_consumers : 0;

  return (
    <Surface
      style={{
        display: "flex",
        flexDirection: "column",
        borderRadius: Borders.Radius.Container.Default,
        background: Colors.Background.Surface.Default,
        overflow: "hidden",
        minHeight: 180,
        border: `1px solid ${AMBER}22`,
      }}
    >
      <div
        style={{
          background: `linear-gradient(135deg, #A06500 0%, ${AMBER} 100%)`,
          padding: "14px 16px 12px",
        }}
      >
        <Flex justifyContent="space-between" alignItems="flex-start" gap={8}>
          <Flex flexDirection="column" gap={2} style={{ minWidth: 0, flex: 1 }}>
            <Text textStyle="small-emphasized" style={{ color: "#fff", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.6px", opacity: 0.9, lineHeight: 1.3 }}>
              Cascade Risk
            </Text>
            <Text textStyle="small" style={{ color: "#fff", opacity: 0.7, fontSize: 10, lineHeight: 1.3 }}>
              {selectedCascadeRisk ? "Filtering table ↓" : "Single points of failure"}
            </Text>
          </Flex>
          <Flex flexDirection="column" alignItems="flex-end" gap={0} style={{ flexShrink: 0, minWidth: 0, maxWidth: "45%" }}>
            <Text style={{ color: "#fff", fontSize: "clamp(16px, 5vw, 24px)", fontWeight: 700, lineHeight: 1, wordBreak: "break-word" }}>
              {maxBlastRadius}
            </Text>
            <Text style={{ color: "#fff", opacity: 0.7, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              downstream apps
            </Text>
          </Flex>
        </Flex>
      </div>
      <Flex flexDirection="column" gap={0} style={{ padding: "4px 0 6px", flex: 1 }}>
        {top5.length === 0 ? (
          <Text
            textStyle="small"
            style={{ color: Colors.Text.Neutral.Default, opacity: 0.45, padding: "12px 14px" }}
          >
            No cascade risk data
          </Text>
        ) : (
          top5.map((cr, i) => {
            const isActive = selectedCascadeRisk === cr.appci;
            return (
              <button
                key={cr.appci}
                onClick={() => onSelect(isActive ? null : cr.appci)}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "7px 14px",
                  background: isActive ? `${AMBER}18` : "transparent",
                  border: "none",
                  borderLeft: isActive ? `3px solid ${AMBER}` : "3px solid transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                  transition: "background 120ms",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "rgba(128,128,128,0.07)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                }}
              >
                <RankBadge rank={i + 1} color={isActive ? AMBER : `${AMBER}88`} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
                    <Text
                      textStyle="small-emphasized"
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        minWidth: 0,
                        fontFamily: "monospace",
                        fontSize: 11,
                        color: isActive ? AMBER : undefined,
                      }}
                    >
                      {cr.appci}
                    </Text>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 3, flexShrink: 0 }}>
                      <Text
                        textStyle="small-emphasized"
                        style={{ color: isActive ? AMBER : Colors.Text.Neutral.Default, fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}
                      >
                        {formatNumber(cr.distinct_consumers)}
                      </Text>
                      <Text
                        textStyle="small"
                        style={{ color: Colors.Text.Neutral.Default, opacity: 0.4, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.5px" }}
                      >
                        consumers
                      </Text>
                    </span>
                  </div>
                  <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.5, fontSize: 10, display: "block", marginTop: 1 }}>
                    {formatNumber(cr.total_req_volume)} requests
                  </Text>
                </div>
              </button>
            );
          })
        )}
      </Flex>
      <Text
        textStyle="small"
        style={{
          color: Colors.Text.Neutral.Default,
          opacity: 0.5,
          fontSize: 9,
          padding: "6px 14px 8px",
          borderTop: "1px solid rgba(128,128,128,0.15)",
          lineHeight: 1.4,
        }}
      >
        Services ranked by blast radius (count of distinct downstream apps). Identifies critical dependencies affecting many services.
      </Text>
    </Surface>
  );
};

const MostCriticalTile = ({ criticalDependencies, selectedCriticalDep, onSelect }: { criticalDependencies: ReadonlyArray<CriticalDependenciesRow>; selectedCriticalDep: string | null; onSelect: (appci: string | null) => void }) => {
  const top5 = criticalDependencies.slice(0, 5);
  const maxCriticalConsumers = criticalDependencies.length > 0 ? criticalDependencies[0].critical_consumers : 0;

  return (
    <Surface
      style={{
        display: "flex",
        flexDirection: "column",
        borderRadius: Borders.Radius.Container.Default,
        background: Colors.Background.Surface.Default,
        overflow: "hidden",
        minHeight: 180,
        border: `1px solid ${improvementGreen}22`,
      }}
    >
      <div
        style={{
          background: `linear-gradient(135deg, #4A8A15 0%, ${improvementGreen} 100%)`,
          padding: "14px 16px 12px",
        }}
      >
        <Flex justifyContent="space-between" alignItems="flex-start" gap={8}>
          <Flex flexDirection="column" gap={2} style={{ minWidth: 0, flex: 1 }}>
            <Text textStyle="small-emphasized" style={{ color: "#fff", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.6px", opacity: 0.9, lineHeight: 1.3 }}>
              Most Critical Dependencies
            </Text>
            <Text textStyle="small" style={{ color: "#fff", opacity: 0.7, fontSize: 10, lineHeight: 1.3 }}>
              {selectedCriticalDep ? "Filtering table ↓" : "Essential linchpin services"}
            </Text>
          </Flex>
          <Flex flexDirection="column" alignItems="flex-end" gap={0} style={{ flexShrink: 0, minWidth: 0, maxWidth: "45%" }}>
            <Text style={{ color: "#fff", fontSize: "clamp(16px, 5vw, 24px)", fontWeight: 700, lineHeight: 1, wordBreak: "break-word" }}>
              {maxCriticalConsumers}
            </Text>
            <Text style={{ color: "#fff", opacity: 0.7, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              critical consumers
            </Text>
          </Flex>
        </Flex>
      </div>
      <Flex flexDirection="column" gap={0} style={{ padding: "4px 0 6px", flex: 1 }}>
        {top5.length === 0 ? (
          <Text
            textStyle="small"
            style={{ color: Colors.Text.Neutral.Default, opacity: 0.45, padding: "12px 14px" }}
          >
            No dependency data
          </Text>
        ) : (
          top5.map((dep, i) => {
            const isActive = selectedCriticalDep === dep.appci;
            return (
              <button
                key={dep.appci}
                onClick={() => onSelect(isActive ? null : dep.appci)}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "7px 14px",
                  background: isActive ? `${improvementGreen}18` : "transparent",
                  border: "none",
                  borderLeft: isActive ? `3px solid ${improvementGreen}` : "3px solid transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                  transition: "background 120ms",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "rgba(128,128,128,0.07)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                }}
              >
                <RankBadge rank={i + 1} color={isActive ? improvementGreen : `${improvementGreen}88`} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
                    <Text
                      textStyle="small-emphasized"
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        minWidth: 0,
                        fontFamily: "monospace",
                        fontSize: 11,
                        color: isActive ? improvementGreen : undefined,
                      }}
                    >
                      {dep.appci}
                    </Text>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 3, flexShrink: 0 }}>
                      <Text
                        textStyle="small-emphasized"
                        style={{ color: isActive ? improvementGreen : Colors.Text.Neutral.Default, fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}
                      >
                        {formatNumber(dep.critical_consumers)}
                      </Text>
                      <Text
                        textStyle="small"
                        style={{ color: Colors.Text.Neutral.Default, opacity: 0.4, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.5px" }}
                      >
                        T1/T2 apps
                      </Text>
                    </span>
                  </div>
                  <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.5, fontSize: 10, display: "block", marginTop: 1 }}>
                    {formatNumber(dep.total_consumers)} total consumers
                  </Text>
                </div>
              </button>
            );
          })
        )}
      </Flex>
      <Text
        textStyle="small"
        style={{
          color: Colors.Text.Neutral.Default,
          opacity: 0.5,
          fontSize: 9,
          padding: "6px 14px 8px",
          borderTop: "1px solid rgba(128,128,128,0.15)",
          lineHeight: 1.4,
        }}
      >
        Services weighted by criticality of their consumers. T1/T2 apps have higher weight—ranks linchpin services for critical business.
      </Text>
    </Surface>
  );
};

const CoverageGapsTile = ({ coverageGaps, selectedCoverageGap, onSelect }: { coverageGaps: ReadonlyArray<CoverageGapsRow>; selectedCoverageGap: string | null; onSelect: (appci: string) => void }) => {
  const top5 = coverageGaps.slice(0, 5);
  const urgentCount = coverageGaps.filter((g) => g.priority === "URGENT").length;
  const priorityColor = (priority: string) => {
    switch (priority) {
      case "URGENT":
        return regressionRed;
      case "HIGH":
        return AMBER;
      default:
        return "#4A7BA7";
    }
  };

  return (
    <Surface
      style={{
        display: "flex",
        flexDirection: "column",
        borderRadius: Borders.Radius.Container.Default,
        background: Colors.Background.Surface.Default,
        overflow: "hidden",
        minHeight: 180,
        border: `1px solid ${regressionRed}22`,
      }}
    >
      <div
        style={{
          background: `linear-gradient(135deg, #7A1525 0%, #C82D40 100%)`,
          padding: "14px 16px 12px",
        }}
      >
        <Flex justifyContent="space-between" alignItems="flex-start" gap={8}>
          <Flex flexDirection="column" gap={2} style={{ minWidth: 0, flex: 1 }}>
            <Text textStyle="small-emphasized" style={{ color: "#fff", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.6px", opacity: 0.9, lineHeight: 1.3 }}>
              Observability Gaps
            </Text>
            <Text textStyle="small" style={{ color: "#fff", opacity: 0.7, fontSize: 10, lineHeight: 1.3 }}>
              T1/T2 apps without logs
            </Text>
          </Flex>
          <Flex flexDirection="column" alignItems="flex-end" gap={0} style={{ flexShrink: 0, minWidth: 0, maxWidth: "45%" }}>
            <Text style={{ color: "#fff", fontSize: "clamp(16px, 5vw, 24px)", fontWeight: 700, lineHeight: 1, wordBreak: "break-word" }}>
              {urgentCount}
            </Text>
            <Text style={{ color: "#fff", opacity: 0.7, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              urgent gaps
            </Text>
          </Flex>
        </Flex>
      </div>
      <Flex flexDirection="column" gap={0} style={{ padding: "4px 0 6px", flex: 1 }}>
        {top5.length === 0 ? (
          <Text
            textStyle="small"
            style={{ color: Colors.Text.Neutral.Default, opacity: 0.45, padding: "12px 14px" }}
          >
            No coverage gaps found
          </Text>
        ) : (
          top5.map((gap, i) => {
            const color = priorityColor(gap.priority);
            return (
              <button
                key={gap.applicationci}
                onClick={() => onSelect(gap.applicationci)}
                title="Click to view observability details"
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "7px 14px",
                  background: "transparent",
                  border: "none",
                  borderLeft: "3px solid transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                  transition: "background 120ms",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(128,128,128,0.07)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                }}
              >
                <RankBadge rank={i + 1} color={color} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
                    <Text
                      textStyle="small-emphasized"
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        minWidth: 0,
                        fontFamily: "monospace",
                        fontSize: 11,
                      }}
                    >
                      {gap.applicationci}
                    </Text>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 3, flexShrink: 0 }}>
                      <Text
                        textStyle="small-emphasized"
                        style={{ color: color, fontWeight: 700, lineHeight: 1.3, textTransform: "uppercase", fontSize: 10 }}
                      >
                        {gap.priority}
                      </Text>
                    </span>
                  </div>
                  <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.5, fontSize: 10, display: "block", marginTop: 1 }}>
                    {gap.p_active_probs > 0 ? `${formatNumber(gap.p_active_probs)} active problems` : gap.tier}
                  </Text>
                </div>
              </button>
            );
          })
        )}
      </Flex>
      <Text
        textStyle="small"
        style={{
          color: Colors.Text.Neutral.Default,
          opacity: 0.5,
          fontSize: 9,
          padding: "6px 14px 8px",
          borderTop: "1px solid rgba(128,128,128,0.15)",
          lineHeight: 1.4,
        }}
      >
        Respects tier and director filters. Click any app to view detailed observability health.
      </Text>
    </Surface>
  );
};

const BlastRadiusCriticalTile = ({ blastRadiusCritical, selectedBlastRadius, onSelect }: { blastRadiusCritical: ReadonlyArray<BlastRadiusCriticalRow>; selectedBlastRadius: string | null; onSelect: (appci: string | null) => void }) => {
  const top5 = blastRadiusCritical.slice(0, 5);
  const maxCriticalApps = blastRadiusCritical.length > 0 ? blastRadiusCritical[0].critical_apps : 0;

  return (
    <Surface
      style={{
        display: "flex",
        flexDirection: "column",
        borderRadius: Borders.Radius.Container.Default,
        background: Colors.Background.Surface.Default,
        overflow: "hidden",
        minHeight: 180,
        border: `1px solid ${PURPLE}22`,
      }}
    >
      <div
        style={{
          background: `linear-gradient(135deg, #5A2878 0%, ${PURPLE} 100%)`,
          padding: "14px 16px 12px",
        }}
      >
        <Flex justifyContent="space-between" alignItems="flex-start" gap={8}>
          <Flex flexDirection="column" gap={2} style={{ minWidth: 0, flex: 1 }}>
            <Text textStyle="small-emphasized" style={{ color: "#fff", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.6px", opacity: 0.9, lineHeight: 1.3 }}>
              Blast Radius to Critical
            </Text>
            <Text textStyle="small" style={{ color: "#fff", opacity: 0.7, fontSize: 10, lineHeight: 1.3 }}>
              {selectedBlastRadius ? "Filtering table ↓" : "T1/T2 apps affected per service"}
            </Text>
          </Flex>
          <Flex flexDirection="column" alignItems="flex-end" gap={0} style={{ flexShrink: 0, minWidth: 0, maxWidth: "45%" }}>
            <Text style={{ color: "#fff", fontSize: "clamp(16px, 5vw, 24px)", fontWeight: 700, lineHeight: 1, wordBreak: "break-word" }}>
              {maxCriticalApps}
            </Text>
            <Text style={{ color: "#fff", opacity: 0.7, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              T1/T2 apps
            </Text>
          </Flex>
        </Flex>
      </div>
      <Flex flexDirection="column" gap={0} style={{ padding: "4px 0 6px", flex: 1 }}>
        {top5.length === 0 ? (
          <Text
            textStyle="small"
            style={{ color: Colors.Text.Neutral.Default, opacity: 0.45, padding: "12px 14px" }}
          >
            No blast radius data
          </Text>
        ) : (
          top5.map((item, i) => {
            const isActive = selectedBlastRadius === item.appci;
            return (
              <button
                key={item.appci}
                onClick={() => onSelect(isActive ? null : item.appci)}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "7px 14px",
                  background: isActive ? `${PURPLE}18` : "transparent",
                  border: "none",
                  borderLeft: isActive ? `3px solid ${PURPLE}` : "3px solid transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                  transition: "background 120ms",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "rgba(128,128,128,0.07)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                }}
              >
                <RankBadge rank={i + 1} color={isActive ? PURPLE : `${PURPLE}88`} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
                    <Text
                      textStyle="small-emphasized"
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        minWidth: 0,
                        fontFamily: "monospace",
                        fontSize: 11,
                        color: isActive ? PURPLE : undefined,
                      }}
                    >
                      {item.appci}
                    </Text>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 3, flexShrink: 0 }}>
                      <Text
                        textStyle="small-emphasized"
                        style={{ color: isActive ? PURPLE : Colors.Text.Neutral.Default, fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}
                      >
                        {formatNumber(item.critical_apps)}
                      </Text>
                      <Text
                        textStyle="small"
                        style={{ color: Colors.Text.Neutral.Default, opacity: 0.4, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.5px" }}
                      >
                        critical
                      </Text>
                    </span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </Flex>
      <Text
        textStyle="small"
        style={{
          color: Colors.Text.Neutral.Default,
          opacity: 0.5,
          fontSize: 9,
          padding: "6px 14px 8px",
          borderTop: "1px solid rgba(128,128,128,0.15)",
          lineHeight: 1.4,
        }}
      >
        Count of T1/T2 apps that depend on each service. Higher counts indicate greater blast radius if service fails.
      </Text>
    </Surface>
  );
};

const ConcentrationRiskTile = ({ concentrationRisk, selectedConcentrationRisk, onSelect }: { concentrationRisk: ReadonlyArray<ConcentrationRiskRow>; selectedConcentrationRisk: string | null; onSelect: (appci: string | null) => void }) => {
  const top5 = concentrationRisk.slice(0, 5);
  const maxRatio = concentrationRisk.length > 0 ? concentrationRisk[0].concentration_ratio : 0;

  return (
    <Surface
      style={{
        display: "flex",
        flexDirection: "column",
        borderRadius: Borders.Radius.Container.Default,
        background: Colors.Background.Surface.Default,
        overflow: "hidden",
        minHeight: 180,
        border: `1px solid ${regressionRed}22`,
      }}
    >
      <div
        style={{
          background: `linear-gradient(135deg, #9A1E30 0%, #C82D40 100%)`,
          padding: "14px 16px 12px",
        }}
      >
        <Flex justifyContent="space-between" alignItems="flex-start" gap={8}>
          <Flex flexDirection="column" gap={2} style={{ minWidth: 0, flex: 1 }}>
            <Text textStyle="small-emphasized" style={{ color: "#fff", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.6px", opacity: 0.9, lineHeight: 1.3 }}>
              Concentration Risk
            </Text>
            <Text textStyle="small" style={{ color: "#fff", opacity: 0.7, fontSize: 10, lineHeight: 1.3 }}>
              {selectedConcentrationRisk ? "Filtering table ↓" : "Over-concentration of critical dependencies"}
            </Text>
          </Flex>
          <Flex flexDirection="column" alignItems="flex-end" gap={0} style={{ flexShrink: 0, minWidth: 0, maxWidth: "45%" }}>
            <Text style={{ color: "#fff", fontSize: "clamp(16px, 5vw, 24px)", fontWeight: 700, lineHeight: 1, wordBreak: "break-word" }}>
              {maxRatio.toFixed(0)}%
            </Text>
            <Text style={{ color: "#fff", opacity: 0.7, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              top risk
            </Text>
          </Flex>
        </Flex>
      </div>
      <Flex flexDirection="column" gap={0} style={{ padding: "4px 0 6px", flex: 1 }}>
        {top5.length === 0 ? (
          <Text
            textStyle="small"
            style={{ color: Colors.Text.Neutral.Default, opacity: 0.45, padding: "12px 14px" }}
          >
            No concentration data
          </Text>
        ) : (
          top5.map((item, i) => {
            const isActive = selectedConcentrationRisk === item.appci;
            return (
              <button
                key={item.appci}
                onClick={() => onSelect(isActive ? null : item.appci)}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "7px 14px",
                  background: isActive ? `${regressionRed}18` : "transparent",
                  border: "none",
                  borderLeft: isActive ? `3px solid ${regressionRed}` : "3px solid transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                  transition: "background 120ms",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "rgba(128,128,128,0.07)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                }}
              >
                <RankBadge rank={i + 1} color={isActive ? regressionRed : `${regressionRed}88`} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
                    <Text
                      textStyle="small-emphasized"
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        minWidth: 0,
                        fontFamily: "monospace",
                        fontSize: 11,
                        color: isActive ? regressionRed : undefined,
                      }}
                    >
                      {item.appci}
                    </Text>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 3, flexShrink: 0 }}>
                      <Text
                        textStyle="small-emphasized"
                        style={{ color: isActive ? regressionRed : Colors.Text.Neutral.Default, fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}
                      >
                        {item.concentration_ratio.toFixed(1)}%
                      </Text>
                      <Text
                        textStyle="small"
                        style={{ color: Colors.Text.Neutral.Default, opacity: 0.4, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.5px" }}
                      >
                        critical
                      </Text>
                    </span>
                  </div>
                  <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.5, fontSize: 10, display: "block", marginTop: 1 }}>
                    {formatNumber(item.critical_count)} of {formatNumber(item.total_count)}
                  </Text>
                </div>
              </button>
            );
          })
        )}
      </Flex>
      <Text
        textStyle="small"
        style={{
          color: Colors.Text.Neutral.Default,
          opacity: 0.5,
          fontSize: 9,
          padding: "6px 14px 8px",
          borderTop: "1px solid rgba(128,128,128,0.15)",
          lineHeight: 1.4,
        }}
      >
        Percentage of consumers that are T1/T2 apps. High % means most downstream are critical—high risk if service fails.
      </Text>
    </Surface>
  );
};

const HighThroughputCriticalTile = ({ highThroughputCritical, selectedHighThroughput, onSelect }: { highThroughputCritical: ReadonlyArray<HighThroughputCriticalRow>; selectedHighThroughput: string | null; onSelect: (appci: string | null) => void }) => {
  const top5 = highThroughputCritical.slice(0, 5);
  const maxVolume = highThroughputCritical.length > 0 ? highThroughputCritical[0].critical_req_volume : 0;

  return (
    <Surface
      style={{
        display: "flex",
        flexDirection: "column",
        borderRadius: Borders.Radius.Container.Default,
        background: Colors.Background.Surface.Default,
        overflow: "hidden",
        minHeight: 180,
        border: `1px solid ${DT_BLUE}22`,
      }}
    >
      <div
        style={{
          background: `linear-gradient(135deg, #0B6BC9 0%, ${DT_BLUE} 100%)`,
          padding: "14px 16px 12px",
        }}
      >
        <Flex justifyContent="space-between" alignItems="flex-start" gap={8}>
          <Flex flexDirection="column" gap={2} style={{ minWidth: 0, flex: 1 }}>
            <Text textStyle="small-emphasized" style={{ color: "#fff", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.6px", opacity: 0.9, lineHeight: 1.3 }}>
              High-Throughput Critical
            </Text>
            <Text textStyle="small" style={{ color: "#fff", opacity: 0.7, fontSize: 10, lineHeight: 1.3 }}>
              {selectedHighThroughput ? "Filtering table ↓" : "Critical business throughput concentration"}
            </Text>
          </Flex>
          <Flex flexDirection="column" alignItems="flex-end" gap={0} style={{ flexShrink: 0, minWidth: 0, maxWidth: "45%" }}>
            <Text style={{ color: "#fff", fontSize: "clamp(16px, 5vw, 24px)", fontWeight: 700, lineHeight: 1, wordBreak: "break-word" }}>
              {formatNumber(maxVolume)}
            </Text>
            <Text style={{ color: "#fff", opacity: 0.7, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              requests
            </Text>
          </Flex>
        </Flex>
      </div>
      <Flex flexDirection="column" gap={0} style={{ padding: "4px 0 6px", flex: 1 }}>
        {top5.length === 0 ? (
          <Text
            textStyle="small"
            style={{ color: Colors.Text.Neutral.Default, opacity: 0.45, padding: "12px 14px" }}
          >
            No throughput data
          </Text>
        ) : (
          top5.map((item, i) => {
            const isActive = selectedHighThroughput === item.appci;
            return (
              <button
                key={item.appci}
                onClick={() => onSelect(isActive ? null : item.appci)}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "7px 14px",
                  background: isActive ? `${DT_BLUE}18` : "transparent",
                  border: "none",
                  borderLeft: isActive ? `3px solid ${DT_BLUE}` : "3px solid transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                  transition: "background 120ms",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "rgba(128,128,128,0.07)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                }}
              >
                <RankBadge rank={i + 1} color={isActive ? DT_BLUE : `${DT_BLUE}88`} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
                    <Text
                      textStyle="small-emphasized"
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        minWidth: 0,
                        fontFamily: "monospace",
                        fontSize: 11,
                        color: isActive ? DT_BLUE : undefined,
                      }}
                    >
                      {item.appci}
                    </Text>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 3, flexShrink: 0 }}>
                      <Text
                        textStyle="small-emphasized"
                        style={{ color: isActive ? DT_BLUE : Colors.Text.Neutral.Default, fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}
                      >
                        {formatNumber(item.critical_req_volume)}
                      </Text>
                      <Text
                        textStyle="small"
                        style={{ color: Colors.Text.Neutral.Default, opacity: 0.4, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.5px" }}
                      >
                        reqs
                      </Text>
                    </span>
                  </div>
                  <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.5, fontSize: 10, display: "block", marginTop: 1 }}>
                    {formatNumber(item.critical_consumers)} T1/T2 apps
                  </Text>
                </div>
              </button>
            );
          })
        )}
      </Flex>
      <Text
        textStyle="small"
        style={{
          color: Colors.Text.Neutral.Default,
          opacity: 0.5,
          fontSize: 9,
          padding: "6px 14px 8px",
          borderTop: "1px solid rgba(128,128,128,0.15)",
          lineHeight: 1.4,
        }}
      >
        Request volume from T1/T2 apps flowing through each service. Identifies services carrying critical business throughput.
      </Text>
    </Surface>
  );
};
