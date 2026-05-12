import React, { useEffect, useMemo, useState } from "react";
import { Sheet } from "@dynatrace/strato-components/overlays";
import { Flex, Grid, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text, Link } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { ToggleButtonGroup } from "@dynatrace/strato-components/forms";
import { DataTable } from "@dynatrace/strato-components/tables";
import type { DataTableColumnDef } from "@dynatrace/strato-components/tables";
import Colors from "@dynatrace/strato-design-tokens/colors";
import Borders from "@dynatrace/strato-design-tokens/borders";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { problemDetailPreQuery } from "../../queries/problemDetailPre";
import { problemDetailPostQuery } from "../../queries/problemDetailPost";
import { windowRange } from "../../queries/dqlUtils";
import type { ProblemScope } from "../../queries/dqlUtils";
import { PermissionRequired } from "./PermissionRequired";
import { useCrosscheck } from "../context/CrosscheckContext";
import { formatDate, formatDateUtc, formatMttr, formatNumber, formatPercent } from "../lib/formatters";
import { inspectError } from "../lib/permissionError";
import { classify, NEW_EMERGENCE_SENTINEL } from "../lib/percentChange";
import { improvementGreen, regressionRed, pivotLineColor } from "../lib/colors";
import type { PerCiRow } from "./PerCiTable";

const DAVIS_PROBLEM_BASE =
  "https://ual.apps.dynatrace.com/ui/apps/dynatrace.davis.problems/problem/";

export interface PerCiDrilldownSheetProps {
  show: boolean;
  ciId: string | null;
  ciName: string | null;
  ciRow: PerCiRow | null;
  problemScope: ProblemScope;
  initialRootCauseFilter?: string | null;
  onDismiss: () => void;
}

interface ProblemRow {
  display_id: string | null;
  eventId: string | null;
  eventName: string | null;
  status: string | null;
  impactLevel: string | null;
  durationNs: number | null;
  affectedUsers: number | null;
  timestamp: string | null;
  eventCount: number | null;
  estImpactAvg: number | null;
  rootCause: string | null;
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }
  if (typeof value === "bigint") return Number(value);
  return null;
}

function recordsToProblemRows(
  records: ReadonlyArray<unknown> | undefined,
): ProblemRow[] {
  if (!records) return [];
  const out: ProblemRow[] = [];
  for (const r of records) {
    if (!r || typeof r !== "object") continue;
    const rec = r as Record<string, unknown>;
    const impactLevel = rec["dt.davis.impact_level"];
    out.push({
      display_id: typeof rec.display_id === "string" ? rec.display_id : null,
      eventId: typeof rec["event.id"] === "string" ? rec["event.id"] as string : null,
      eventName: typeof rec["event.name"] === "string" ? rec["event.name"] as string : null,
      status: typeof rec["event.status"] === "string" ? rec["event.status"] as string : null,
      impactLevel: Array.isArray(impactLevel)
        ? impactLevel.filter((v) => typeof v === "string").join(", ")
        : typeof impactLevel === "string"
          ? impactLevel
          : null,
      durationNs: coerceNumber(rec.durationNs),
      affectedUsers: coerceNumber(rec["dt.davis.affected_users_count"]),
      timestamp: typeof rec.timestamp === "string" ? rec.timestamp : null,
      eventCount: coerceNumber(rec["dt.davis.event_count"]),
      estImpactAvg:
        typeof rec.estImpactAvg === "number" && rec.estImpactAvg > 0
          ? (rec.estImpactAvg as number)
          : null,
      rootCause:
        typeof rec.root_cause_entity_name === "string" && rec.root_cause_entity_name !== ""
          ? (rec.root_cause_entity_name as string)
          : null,
    });
  }
  return out;
}

const STAT_THEMES: Record<string, { gradientFrom: string; gradientTo: string; accent: string }> = {
  "Revenue impact": { gradientFrom: "#9A1E30", gradientTo: "#C82D40", accent: regressionRed },
  "Avg MTTR":       { gradientFrom: "#C48800", gradientTo: "#F5A800", accent: "#F5A800" },
  "Problem count":  { gradientFrom: "#1446B8", gradientTo: "#1C5BE5", accent: "#1C5BE5" },
};

const StatCard = ({
  label,
  pre,
  post,
  pctChange,
  format,
}: {
  label: string;
  pre: number | null | undefined;
  post: number | null | undefined;
  pctChange: number | null;
  format: (v: number | null | undefined) => string;
}) => {
  const isNew = pctChange === NEW_EMERGENCE_SENTINEL;
  const isRegression = pctChange !== null && !isNew && pctChange > 0.01;
  const isImprovement = pctChange !== null && !isNew && pctChange < -0.01;
  const pctDisplay = isNew
    ? "+∞"
    : pctChange !== null
      ? formatPercent(classify(pctChange).value)
      : null;
  const theme = STAT_THEMES[label] ?? { gradientFrom: "#555", gradientTo: "#888", accent: pivotLineColor };
  const badgeBg = isImprovement ? "rgba(115,190,40,0.25)" : isRegression ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.2)";
  const badgeColor = isImprovement ? "#c8ffa0" : "#fff";

  return (
    <Surface
      style={{
        display: "flex",
        flexDirection: "column",
        borderRadius: Borders.Radius.Container.Default,
        overflow: "hidden",
        background: `linear-gradient(135deg, ${theme.gradientFrom} 0%, ${theme.gradientTo} 100%)`,
        padding: "14px 16px 12px",
        gap: 4,
      }}
    >
      <Text style={{ color: "#fff", opacity: 0.85, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 600 }}>
        {label}
      </Text>
      <Flex alignItems="baseline" gap={8}>
        <Text style={{ color: "#fff", fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>
          {format(post)}
        </Text>
        {pctDisplay && (
          <span
            style={{
              fontSize: 16,
              color: badgeColor,
              fontWeight: 800,
              background: badgeBg,
              padding: "3px 10px",
              borderRadius: 6,
              letterSpacing: "-0.3px",
              lineHeight: 1,
            }}
          >
            {pctDisplay}
          </span>
        )}
      </Flex>
      <Text style={{ color: "#fff", opacity: 0.6, fontSize: 11, marginTop: 2 }}>
        from {format(pre)}
      </Text>
    </Surface>
  );
};

const VerdictCard = ({ ciRow }: { ciRow: PerCiRow }) => {
  const candidates = [ciRow.mttrPctChange, ciRow.countPctChange, ciRow.affectedUsersPctChange];
  const isNew = candidates.some((v) => v === NEW_EMERGENCE_SENTINEL);
  const primary = ciRow.affectedUsersPctChange ?? ciRow.countPctChange ?? ciRow.mttrPctChange;
  let verdict: string;
  let gradientFrom: string;
  let gradientTo: string;
  if (isNew) { verdict = "Newly Emerged"; gradientFrom = "#9A1E30"; gradientTo = "#C82D40"; }
  else if (primary !== null && primary > 0.01) { verdict = "Regressed"; gradientFrom = "#9A1E30"; gradientTo = "#C82D40"; }
  else if (primary !== null && primary < -0.01) { verdict = "Improved"; gradientFrom = "#4A8A15"; gradientTo = "#73BE28"; }
  else { verdict = "Stable"; gradientFrom = "#555"; gradientTo = "#777"; }

  const tierLabel = ciRow.Tier ? `Tier ${ciRow.Tier}` : null;
  const dirLabel = ciRow.Director ?? null;

  return (
    <Surface
      style={{
        display: "flex",
        flexDirection: "column",
        borderRadius: Borders.Radius.Container.Default,
        overflow: "hidden",
        background: `linear-gradient(135deg, ${gradientFrom} 0%, ${gradientTo} 100%)`,
        padding: "14px 16px 12px",
        gap: 4,
      }}
    >
      <Text style={{ color: "#fff", opacity: 0.85, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 600 }}>
        Verdict
      </Text>
      <Text style={{ color: "#fff", fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>
        {verdict}
      </Text>
      <Flex alignItems="center" gap={6} style={{ marginTop: 2 }}>
        {tierLabel && (
          <Text style={{ color: "#fff", opacity: 0.7, fontSize: 11 }}>{tierLabel}</Text>
        )}
        {tierLabel && dirLabel && (
          <span style={{ color: "#fff", opacity: 0.35, fontSize: 11 }}>·</span>
        )}
        {dirLabel && (
          <Text style={{ color: "#fff", opacity: 0.7, fontSize: 11 }}>{dirLabel}</Text>
        )}
      </Flex>
    </Surface>
  );
};

export const PerCiDrilldownSheet = ({
  show,
  ciId,
  ciName,
  ciRow,
  problemScope,
  initialRootCauseFilter,
  onDismiss,
}: PerCiDrilldownSheetProps) => {
  const { pivotIso, windowDays } = useCrosscheck();
  const drillRange = useMemo(() => windowRange(pivotIso, windowDays), [pivotIso, windowDays]);
  const [windowSide, setWindowSide] = useState<"pre" | "post">("post");
  const [rootCauseFilter, setRootCauseFilter] = useState<string | null>(null);

  useEffect(() => { setRootCauseFilter(show ? (initialRootCauseFilter ?? null) : null); }, [show, ciId]);

  const queryString = useMemo(() => {
    if (!ciId) return "";
    const params = { pivotIso, windowDays, ciId, problemScope };
    return windowSide === "pre"
      ? problemDetailPreQuery(params)
      : problemDetailPostQuery(params);
  }, [ciId, pivotIso, windowDays, windowSide, problemScope]);

  const dqlExecParams = useMemo(() => ({
    defaultScanLimitGbytes: -1,
    fetchTimeoutSeconds: windowDays > 60 ? 300 : 120,
    requestTimeoutMilliseconds: 60_000,
  }), [windowDays]);

  const { data, error, isLoading, refetch } = useDql(
    { query: queryString, ...dqlExecParams },
    { enabled: show && Boolean(ciId) },
  );

  const rows = useMemo(
    () => recordsToProblemRows(data?.records),
    [data?.records],
  );

  const filteredRows = useMemo(
    () => rootCauseFilter ? rows.filter((r) => r.rootCause === rootCauseFilter) : rows,
    [rows, rootCauseFilter],
  );

  const topRootCauses = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (!row.rootCause) continue;
      counts.set(row.rootCause, (counts.get(row.rootCause) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => ({ name, count }));
  }, [rows]);

  const columns = useMemo<DataTableColumnDef<ProblemRow>[]>(
    () => [
      {
        id: "id",
        header: "Problem",
        accessor: "display_id",
        width: 130,
        cell: ({ rowData }) =>
          rowData.eventId ? (
            <Link
              href={`${DAVIS_PROBLEM_BASE}${rowData.eventId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {rowData.display_id ?? rowData.eventId}
            </Link>
          ) : (
            <Text textStyle="small">{rowData.display_id ?? "—"}</Text>
          ),
      },
      {
        id: "name",
        header: "Title",
        accessor: "eventName",
        width: { type: "auto", maxWidth: 300 },
      },
      {
        id: "status",
        header: "Status",
        accessor: "status",
        width: 100,
        cell: ({ rowData }) => {
          const isActive = rowData.status === "ACTIVE";
          return (
            <span
              style={{
                display: "inline-block",
                fontSize: 11,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 10,
                background: isActive ? "rgba(200,45,64,0.12)" : "rgba(115,190,40,0.10)",
                color: isActive ? regressionRed : improvementGreen,
              }}
            >
              {rowData.status ?? "—"}
            </span>
          );
        },
      },
      {
        id: "impact",
        header: "Impact",
        accessor: "impactLevel",
        width: 140,
        cell: ({ rowData }) => {
          const raw = rowData.impactLevel ?? "";
          const lower = raw.toLowerCase();
          let bg = "rgba(128,128,128,0.10)";
          let fg = Colors.Text.Neutral.Default;
          if (lower.includes("infrastructure") || lower.includes("environment")) { bg = "rgba(200,45,64,0.12)"; fg = regressionRed; }
          else if (lower.includes("service")) { bg = "rgba(245,168,0,0.12)"; fg = "#C48800"; }
          else if (lower.includes("application")) { bg = "rgba(124,56,160,0.12)"; fg = "#7C38A0"; }
          return raw ? (
            <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: bg, color: fg, whiteSpace: "nowrap" }}>
              {raw}
            </span>
          ) : (
            <Text textStyle="small">—</Text>
          );
        },
      },
      {
        id: "rootCause",
        header: "Root Cause",
        accessor: "rootCause",
        width: { type: "auto", maxWidth: 220 },
        cell: ({ rowData }) => (
          <Text textStyle="small" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {rowData.rootCause ?? "—"}
          </Text>
        ),
      },
      {
        id: "duration",
        header: "Duration",
        accessor: (row: ProblemRow) => row.durationNs ?? 0,
        width: 110,
        cell: ({ rowData }) => {
          const ns = rowData.durationNs;
          const hours = ns !== null ? ns / 3_600_000_000_000 : 0;
          const color = hours >= 12 ? regressionRed : hours >= 4 ? "#F5A800" : undefined;
          return (
            <Text textStyle="small" style={color ? { color, fontWeight: 600 } : undefined}>
              {formatMttr(ns)}
            </Text>
          );
        },
      },
      {
        id: "users",
        header: "Affected users",
        accessor: (row: ProblemRow) => row.affectedUsers ?? 0,
        width: 120,
        cell: ({ rowData }) => {
          const users = rowData.affectedUsers;
          const color = users !== null && users >= 1000 ? regressionRed : users !== null && users >= 100 ? "#F5A800" : undefined;
          return (
            <Text textStyle="small" style={color ? { color, fontWeight: 600 } : undefined}>
              {formatNumber(users)}
            </Text>
          );
        },
      },
      {
        id: "ts",
        header: "Started",
        accessor: "timestamp",
        width: 150,
        cell: ({ rowData }) => (
          <Text textStyle="small">{formatDate(rowData.timestamp)}</Text>
        ),
      },
    ],
    [],
  );

  const errorInfo = error ? inspectError(error) : null;

  return (
    <Sheet
      show={show}
      title={ciName ? `${ciName}` : "Application detail"}
      onDismiss={onDismiss}
      actions={
        <Button onClick={onDismiss} variant="default">
          Close
        </Button>
      }
    >
      <Flex flexDirection="column" gap={20} padding={16}>

        {/* Stat summary header */}
        {ciRow && (
          <Flex flexDirection="column" gap={12}>
            <Flex alignItems="center" gap={8} flexFlow="wrap">
              <Heading level={4} style={{ margin: 0 }}>
                {ciId?.toUpperCase() ?? ""}
              </Heading>
              <Flex alignItems="center" gap={6} style={{ fontSize: 11 }}>
                <span style={{ color: "#1C5BE5", fontWeight: 600 }}>Pre</span>
                <span style={{ color: Colors.Text.Neutral.Default, opacity: 0.75 }}>
                  {formatDateUtc(drillRange.preStartIso)} – {formatDateUtc(drillRange.pivotIso)}
                </span>
                <span style={{ color: Colors.Text.Neutral.Default, opacity: 0.3 }}>|</span>
                <span style={{ color: "#888888", fontWeight: 600 }}>Pivot</span>
                <span style={{ color: Colors.Text.Neutral.Default, opacity: 0.75 }}>
                  {formatDateUtc(drillRange.pivotIso)}
                </span>
                <span style={{ color: Colors.Text.Neutral.Default, opacity: 0.3 }}>|</span>
                <span style={{ color: "#C82D40", fontWeight: 600 }}>Post</span>
                <span style={{ color: Colors.Text.Neutral.Default, opacity: 0.75 }}>
                  {formatDateUtc(drillRange.pivotIso)} – {formatDateUtc(drillRange.postEndIso)}
                </span>
              </Flex>
            </Flex>
            <Grid gridTemplateColumns="repeat(4, 1fr)" gap={12}>
              <StatCard
                label="Affected Users"
                pre={ciRow.preAffectedUsers}
                post={ciRow.postAffectedUsers}
                pctChange={ciRow.affectedUsersPctChange}
                format={formatNumber}
              />
              <StatCard
                label="Avg MTTR"
                pre={ciRow.preMTTR_ns}
                post={ciRow.postMTTR_ns}
                pctChange={ciRow.mttrPctChange}
                format={formatMttr}
              />
              <StatCard
                label="Problem count"
                pre={ciRow.preCount}
                post={ciRow.postCount}
                pctChange={ciRow.countPctChange}
                format={formatNumber}
              />
              <VerdictCard ciRow={ciRow} />
            </Grid>

            {/* Top root causes tile */}
            <Surface
              style={{
                padding: "14px 18px",
                borderRadius: Borders.Radius.Container.Default,
                background: "linear-gradient(135deg, rgba(124,56,160,0.10) 0%, rgba(28,91,229,0.08) 100%)",
                border: "1px solid rgba(124,56,160,0.18)",
              }}
            >
              <Flex alignItems="flex-start" gap={16}>
                <Flex flexDirection="column" gap={4} style={{ flexShrink: 0 }}>
                  <Text textStyle="small-emphasized" style={{ color: "#7C38A0" }}>
                    Top Root Causes
                  </Text>
                  <Flex alignItems="center" gap={8}>
                    <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.6 }}>
                      {windowSide === "pre" ? "Pre" : "Post"} window
                    </Text>
                    {rootCauseFilter && (
                      <button
                        onClick={() => setRootCauseFilter(null)}
                        style={{
                          fontSize: 10,
                          color: "#7C38A0",
                          background: "rgba(124,56,160,0.12)",
                          border: "none",
                          borderRadius: 4,
                          padding: "2px 6px",
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        ✕ Clear filter
                      </button>
                    )}
                  </Flex>
                </Flex>
                <Flex gap={12} flexFlow="wrap" style={{ flex: 1 }}>
                  {topRootCauses.length === 0 && !isLoading ? (
                    <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.5, padding: "2px 0" }}>
                      No root cause data available
                    </Text>
                  ) : (
                    topRootCauses.map((rc, i) => {
                      const isActive = rootCauseFilter === rc.name;
                      return (
                        <button
                          key={rc.name}
                          onClick={() => setRootCauseFilter(isActive ? null : rc.name)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            background: isActive ? "rgba(124,56,160,0.18)" : "rgba(124,56,160,0.06)",
                            border: isActive ? "1px solid rgba(124,56,160,0.5)" : "1px solid rgba(124,56,160,0.15)",
                            borderRadius: 8,
                            padding: "6px 10px",
                            cursor: "pointer",
                            textAlign: "left",
                            transition: "all 120ms",
                          }}
                          onMouseEnter={(e) => {
                            if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "rgba(124,56,160,0.12)";
                          }}
                          onMouseLeave={(e) => {
                            if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "rgba(124,56,160,0.06)";
                          }}
                        >
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: 20,
                              height: 20,
                              borderRadius: "50%",
                              background: isActive ? "#7C38A0" : "rgba(124,56,160,0.35)",
                              color: "#fff",
                              fontSize: 10,
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {i + 1}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <Text
                              textStyle="small-emphasized"
                              style={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                color: isActive ? "#7C38A0" : undefined,
                              }}
                            >
                              {rc.name}
                            </Text>
                            <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.6, fontSize: 10 }}>
                              {rc.count} problem{rc.count !== 1 ? "s" : ""}
                            </Text>
                          </div>
                        </button>
                      );
                    })
                  )}
                </Flex>
              </Flex>
            </Surface>
          </Flex>
        )}

        {/* Problem detail table */}
        <Flex flexDirection="column" gap={12}>
          <Flex alignItems="center" gap={12} flexFlow="wrap">
            <Text textStyle="small-emphasized">Problems</Text>
            <ToggleButtonGroup
              value={windowSide}
              onChange={(v) => {
                if (v === "pre" || v === "post") {
                  setWindowSide(v);
                  setRootCauseFilter(null);
                }
              }}
            >
              <ToggleButtonGroup.Item value="pre">Pre window</ToggleButtonGroup.Item>
              <ToggleButtonGroup.Item value="post">Post window</ToggleButtonGroup.Item>
            </ToggleButtonGroup>
            {!isLoading && (
              <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default }}>
                {rootCauseFilter
                  ? `${filteredRows.length} of ${rows.length} problem${rows.length !== 1 ? "s" : ""}`
                  : `${rows.length} problem${rows.length !== 1 ? "s" : ""}`}
              </Text>
            )}
          </Flex>

          {errorInfo?.isPermission ? (
            <PermissionRequired
              surface="inline"
              scope={errorInfo.missingScope ?? "storage:events:read"}
              reason="Per-problem detail couldn't load. Check tenant access to dt.davis.problems."
              onRetry={() => void refetch()}
            />
          ) : error ? (
            <Text style={{ color: Colors.Text.Critical.Default }}>
              Failed to load: {errorInfo?.rawMessage || "unknown error"}
            </Text>
          ) : (
            <DataTable data={filteredRows} columns={columns} loading={isLoading} sortable fullWidth>
              <DataTable.EmptyState>
                {isLoading ? "Loading…" : rootCauseFilter ? "No problems match this root cause." : "No problems for this window."}
              </DataTable.EmptyState>
            </DataTable>
          )}
        </Flex>
      </Flex>
    </Sheet>
  );
};
