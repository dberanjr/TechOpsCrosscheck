import React, { useMemo } from "react";
import { Flex, Grid, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import Borders from "@dynatrace/strato-design-tokens/borders";
import type { PerCiRow } from "./PerCiTable";
import type { RootCauseEntry } from "../../queries/topRootCauses";
import type { CascadeRiskRow } from "../../queries/cascadeRisk";
import type { CoverageGapsRow } from "../../queries/coverageGaps";
import { formatMttr, formatNumber } from "../lib/formatters";
import { improvementGreen, regressionRed } from "../lib/colors";

const AMBER = "#F5A800";
const PURPLE = "#7C38A0";
const DT_BLUE = "#1496FF";

export interface InsightTilesProps {
  rows: ReadonlyArray<PerCiRow>;
  rootCauses: ReadonlyArray<RootCauseEntry>;
  cascadeRisk: ReadonlyArray<CascadeRiskRow>;
  coverageGaps: ReadonlyArray<CoverageGapsRow>;
  selectedRootCause: string | null;
  onCiSelect: (row: PerCiRow) => void;
  onRootCauseSelect: (rc: RootCauseEntry | null) => void;
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
        <Flex flexDirection="column" alignItems="flex-end" gap={0} style={{ flexShrink: 0 }}>
          <Text style={{ color: "#fff", fontSize: 24, fontWeight: 700, lineHeight: 1 }}>
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
          <Flex flexDirection="column" alignItems="flex-end" gap={0} style={{ flexShrink: 0 }}>
            <Text style={{ color: "#fff", fontSize: 24, fontWeight: 700, lineHeight: 1 }}>
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
    </Surface>
  );
};

export const InsightTiles = ({ rows, rootCauses, cascadeRisk, coverageGaps, selectedRootCause, onCiSelect, onRootCauseSelect }: InsightTilesProps) => {
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
        onSelect={onCiSelect}
      />
      <RootCauseTile
        rootCauses={rootCauses}
        selectedRootCause={selectedRootCause}
        onRootCauseSelect={onRootCauseSelect}
      />
      <CascadeRiskTile cascadeRisk={cascadeRisk} />
      <CoverageGapsTile coverageGaps={coverageGaps} />
    </Grid>
  );
};

const CascadeRiskTile = ({ cascadeRisk }: { cascadeRisk: ReadonlyArray<CascadeRiskRow> }) => {
  const top5 = cascadeRisk.slice(0, 5);
  const maxBlastRadius = cascadeRisk.length > 0 ? cascadeRisk[0].distinct_consumers : 0;
  const totalConsumers = new Set(cascadeRisk.flatMap((r) => Array(r.distinct_consumers).fill(r.appci))).size;

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
              Single points of failure
            </Text>
          </Flex>
          <Flex flexDirection="column" alignItems="flex-end" gap={0} style={{ flexShrink: 0 }}>
            <Text style={{ color: "#fff", fontSize: 24, fontWeight: 700, lineHeight: 1 }}>
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
          top5.map((cr, i) => (
            <div
              key={cr.appci}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "7px 14px",
                background: "transparent",
                textAlign: "left",
                width: "100%",
              }}
            >
              <RankBadge rank={i + 1} color={AMBER} />
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
                    {cr.appci}
                  </Text>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 3, flexShrink: 0 }}>
                    <Text
                      textStyle="small-emphasized"
                      style={{ color: AMBER, fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}
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
            </div>
          ))
        )}
      </Flex>
    </Surface>
  );
};

const CoverageGapsTile = ({ coverageGaps }: { coverageGaps: ReadonlyArray<CoverageGapsRow> }) => {
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
          <Flex flexDirection="column" alignItems="flex-end" gap={0} style={{ flexShrink: 0 }}>
            <Text style={{ color: "#fff", fontSize: 24, fontWeight: 700, lineHeight: 1 }}>
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
              <div
                key={gap.applicationci}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "7px 14px",
                  background: "transparent",
                  textAlign: "left",
                  width: "100%",
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
                        style={{ color, fontSize: 12, fontWeight: 700, lineHeight: 1.3, textTransform: "uppercase", fontSize: 10 }}
                      >
                        {gap.priority}
                      </Text>
                    </span>
                  </div>
                  <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.5, fontSize: 10, display: "block", marginTop: 1 }}>
                    {gap.p_active_probs > 0 ? `${formatNumber(gap.p_active_probs)} active problems` : gap.tier}
                  </Text>
                </div>
              </div>
            );
          })
        )}
      </Flex>
    </Surface>
  );
};
