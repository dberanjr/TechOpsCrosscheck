import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Flex, Surface, Grid } from "@dynatrace/strato-components/layouts";
import { Text, Heading, Link } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Sheet } from "@dynatrace/strato-components/overlays";
import { DataTable, type DataTableColumnDef } from "@dynatrace/strato-components/tables";
import Colors from "@dynatrace/strato-design-tokens/colors";
import Borders from "@dynatrace/strato-design-tokens/borders";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { useCrosscheck } from "../context/CrosscheckContext";
import {
  liveActiveProblemsQuery,
  recordsToLiveProblems,
  type LiveProblemRow,
} from "../../queries/liveProblems";
import { HoneycombChart, type HoneycombCell } from "../components/HoneycombChart";
import { formatUsd, formatNumber } from "../lib/formatters";
import { regressionRed } from "../lib/colors";

const DAVIS_PROBLEM_BASE =
  "https://ual.apps.dynatrace.com/ui/apps/dynatrace.davis.problems/problem/";

interface CiSummary {
  ci: string;
  appName: string;
  tier: string;
  count: number;
  totalRaR: number;
}

// ─── helpers ───────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.floor(ms / 1_000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)}h`;
  return `${(ms / 86_400_000).toFixed(1)}d`;
}

function formatAgo(date: Date | null): string {
  if (!date) return "—";
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

const CATEGORY_META: Record<string, { label: string; color: string; bg: string }> = {
  ERROR:                  { label: "Error",             color: "#C82D40", bg: "rgba(200,45,64,0.12)" },
  SLOWDOWN:               { label: "Slowdown",          color: "#E87722", bg: "rgba(232,119,34,0.12)" },
  AVAILABILITY:           { label: "Availability",      color: "#F5A800", bg: "rgba(245,168,0,0.12)" },
  RESOURCE_CONTENTION:    { label: "Resource",          color: "#7C38A0", bg: "rgba(124,56,160,0.12)" },
  CUSTOM_ALERT:           { label: "Custom Alert",      color: "#1496FF", bg: "rgba(20,150,255,0.12)" },
  MONITORING_UNAVAILABLE: { label: "Monitoring Gap",    color: "#888",    bg: "rgba(128,128,128,0.12)" },
};

function catMeta(cat: string) {
  return CATEGORY_META[cat] ?? { label: cat, color: "#aaa", bg: "rgba(128,128,128,0.10)" };
}

// ─── sub-components ────────────────────────────────────────────────────────

const PulseDot = () => (
  <span
    style={{
      display: "inline-block",
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: regressionRed,
      boxShadow: `0 0 0 3px rgba(200,45,64,0.25)`,
      animation: "lm-pulse 1.8s ease-in-out infinite",
      flexShrink: 0,
    }}
  />
);

const HeroCard = ({
  label,
  value,
  sub,
  accent,
  gradFrom,
  gradTo,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: string;
  gradFrom: string;
  gradTo: string;
}) => (
  <Surface
    style={{
      display: "flex",
      flexDirection: "column",
      background: `linear-gradient(135deg, ${gradFrom} 0%, ${gradTo} 100%)`,
      borderRadius: Borders.Radius.Container.Default,
      padding: "14px 18px",
      gap: 2,
      overflow: "hidden",
      border: `1px solid ${accent}33`,
    }}
  >
    <Text style={{ color: "#fff", opacity: 0.8, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 600 }}>
      {label}
    </Text>
    <Text style={{ color: "#fff", fontSize: 26, fontWeight: 700, lineHeight: 1 }}>
      {value}
    </Text>
    {sub && (
      <Text style={{ color: "#fff", opacity: 0.6, fontSize: 10, marginTop: 2 }}>
        {sub}
      </Text>
    )}
  </Surface>
);

const CategoryPill = ({
  cat,
  count,
  active,
  onClick,
}: {
  cat: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) => {
  const meta = catMeta(cat);
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 12px",
        borderRadius: 20,
        border: active ? `1.5px solid ${meta.color}` : `1px solid ${meta.color}44`,
        background: active ? meta.bg : "transparent",
        cursor: "pointer",
        transition: "all 120ms",
        fontSize: 12,
        fontWeight: active ? 700 : 500,
        color: active ? meta.color : Colors.Text.Neutral.Default,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: meta.color,
          flexShrink: 0,
        }}
      />
      {meta.label}
      <span style={{ opacity: 0.8, fontSize: 11 }}>({count})</span>
    </button>
  );
};

const CategoryBreakdownBar = ({
  breakdown,
  selectedCategory,
  onSelect,
}: {
  breakdown: Array<{ cat: string; count: number }>;
  selectedCategory: string | null;
  onSelect: (cat: string | null) => void;
}) => {
  const total = breakdown.reduce((s, b) => s + b.count, 0);
  if (total === 0 || breakdown.length === 0) return null;
  return (
    <div>
      <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
        {breakdown.map(({ cat, count }) => {
          const meta = catMeta(cat);
          return (
            <div
              key={cat}
              style={{ flex: count, background: meta.color, opacity: 0.85 }}
              title={`${meta.label}: ${count}`}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {breakdown.map(({ cat, count }) => (
          <CategoryPill
            key={cat}
            cat={cat}
            count={count}
            active={selectedCategory === cat}
            onClick={() => onSelect(selectedCategory === cat ? null : cat)}
          />
        ))}
      </div>
    </div>
  );
};

interface CiSummary {
  ci: string;
  appName: string;
  tier: string;
  count: number;
  totalRaR: number;
}

const TopCisPanel = ({
  cis,
  selectedCi,
  onSelect,
}: {
  cis: CiSummary[];
  selectedCi: string | null;
  onSelect: (ci: string | null) => void;
}) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    {cis.slice(0, 6).map((entry, i) => {
      const isActive = selectedCi === entry.ci;
      return (
        <button
          key={entry.ci}
          onClick={() => onSelect(isActive ? null : entry.ci)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 10px",
            background: isActive ? "rgba(200,45,64,0.10)" : "transparent",
            border: "none",
            borderLeft: isActive ? `3px solid ${regressionRed}` : "3px solid transparent",
            cursor: "pointer",
            borderRadius: isActive ? "0 6px 6px 0" : 0,
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
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: isActive ? regressionRed : "rgba(200,45,64,0.3)",
              color: "#fff",
              fontSize: 9,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {i + 1}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 4, alignItems: "baseline" }}>
              <Text
                textStyle="small-emphasized"
                style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "monospace", fontSize: 11 }}
              >
                {entry.ci}
              </Text>
              <Text textStyle="small" style={{ color: regressionRed, fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
                {entry.count} {entry.count === 1 ? "problem" : "problems"}
              </Text>
            </div>
            {entry.totalRaR > 0 && (
              <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.5, fontSize: 10 }}>
                {formatUsd(entry.totalRaR)} at risk
              </Text>
            )}
          </div>
        </button>
      );
    })}
  </div>
);

// ─── problem detail sheet ──────────────────────────────────────────────────

const LiveProblemSheet = ({
  problem,
  appName,
  tier,
  onDismiss,
}: {
  problem: LiveProblemRow | null;
  appName: string;
  tier: string;
  onDismiss: () => void;
}) => {
  if (!problem) return null;
  const cat = catMeta(problem.category);
  const dtLink = problem.eventId ? `${DAVIS_PROBLEM_BASE}${problem.eventId}` : null;

  const stats: Array<{ label: string; value: string; accent: string; grad: [string, string] }> = [
    {
      label: "Duration",
      value: formatDuration(problem.durationMs),
      accent: "#F5A800",
      grad: ["#C48800", "#F5A800"],
    },
    {
      label: "Revenue at Risk",
      value: problem.revenueAtRisk > 0 ? formatUsd(problem.revenueAtRisk) : "—",
      accent: regressionRed,
      grad: ["#9A1E30", "#C82D40"],
    },
    {
      label: "Daily Loss Rate",
      value: problem.avgDailyLoss > 0 ? formatUsd(problem.avgDailyLoss) + "/day" : "—",
      accent: "#E87722",
      grad: ["#A04900", "#E87722"],
    },
  ];

  return (
    <Sheet
      show={problem !== null}
      title={problem.displayId}
      onDismiss={onDismiss}
      actions={
        <Button onClick={onDismiss} variant="default">Close</Button>
      }
    >
      <Flex flexDirection="column" gap={20} padding={16}>

        {/* Title + meta */}
        <Flex flexDirection="column" gap={6}>
          <Heading level={4} style={{ margin: 0 }}>{problem.title}</Heading>
          <Flex alignItems="center" gap={8} flexFlow="wrap">
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "3px 10px",
                borderRadius: 10,
                background: cat.bg,
                color: cat.color,
              }}
            >
              {cat.label}
            </span>
            {problem.impactLevel && (
              <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.7 }}>
                {problem.impactLevel} impact
              </Text>
            )}
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "3px 10px",
                borderRadius: 10,
                background: "rgba(200,45,64,0.12)",
                color: regressionRed,
              }}
            >
              ACTIVE
            </span>
          </Flex>
        </Flex>

        {/* Stat cards */}
        <Grid gridTemplateColumns="repeat(3, 1fr)" gap={12}>
          {stats.map((s) => (
            <Surface
              key={s.label}
              style={{
                background: `linear-gradient(135deg, ${s.grad[0]} 0%, ${s.grad[1]} 100%)`,
                borderRadius: Borders.Radius.Container.Default,
                padding: "12px 14px",
                overflow: "hidden",
              }}
            >
              <Text style={{ color: "#fff", opacity: 0.8, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 600 }}>
                {s.label}
              </Text>
              <Text style={{ color: "#fff", fontSize: 18, fontWeight: 700, lineHeight: 1.2, marginTop: 4 }}>
                {s.value}
              </Text>
            </Surface>
          ))}
        </Grid>

        {/* App info */}
        <Surface
          style={{
            padding: "14px 16px",
            borderRadius: Borders.Radius.Container.Default,
            background: "rgba(128,128,128,0.04)",
            border: "1px solid rgba(128,128,128,0.12)",
          }}
        >
          <Flex flexDirection="column" gap={8}>
            <Text textStyle="small-emphasized" style={{ color: Colors.Text.Neutral.Default, opacity: 0.6, textTransform: "uppercase", fontSize: 10, letterSpacing: "0.5px" }}>
              Application
            </Text>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 6, columnGap: 14, fontSize: 12 }}>
              <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.55 }}>AppCI</Text>
              <Text textStyle="small-emphasized" style={{ fontFamily: "monospace" }}>{problem.singleAppCI}</Text>
              {appName && (
                <>
                  <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.55 }}>Name</Text>
                  <Text textStyle="small">{appName}</Text>
                </>
              )}
              {tier && (
                <>
                  <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.55 }}>Tier</Text>
                  <Text textStyle="small">{tier}</Text>
                </>
              )}
              {problem.rootCause && (
                <>
                  <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.55 }}>Root Cause</Text>
                  <Text textStyle="small">{problem.rootCause}</Text>
                </>
              )}
              <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.55 }}>Started</Text>
              <Text textStyle="small">
                {problem.problemStart ? new Date(problem.problemStart).toLocaleString() : "—"}
              </Text>
            </div>
          </Flex>
        </Surface>

        {/* Actions */}
        {dtLink && (
          <Flex gap={8}>
            <Link href={dtLink} target="_blank" rel="noopener noreferrer">
              View in Dynatrace →
            </Link>
          </Flex>
        )}
      </Flex>
    </Sheet>
  );
};

// ─── main page ─────────────────────────────────────────────────────────────

export const LiveMode = () => {
  const { appCiFilter, problemScope, applicationList } = useCrosscheck();

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [ticker, setTicker] = useState(0);
  const [selectedCi, setSelectedCi] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [detailProblem, setDetailProblem] = useState<LiveProblemRow | null>(null);
  const [showFullPortfolio, setShowFullPortfolio] = useState(false);

  const query = useMemo(
    () => liveActiveProblemsQuery({ appCiFilter, problemScope }),
    [appCiFilter, problemScope],
  );

  const { data, isLoading, error, refetch } = useDql({
    query,
    defaultScanLimitGbytes: -1,
    requestTimeoutMilliseconds: 60_000,
  });

  // Tick every second to refresh "X ago" display
  useEffect(() => {
    const id = setInterval(() => setTicker((t) => t + 1), 5_000);
    return () => clearInterval(id);
  }, []);

  // Auto-refresh every 60s
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => { void refetch(); }, 60_000);
    return () => clearInterval(id);
  }, [autoRefresh, refetch]);

  useEffect(() => {
    if (!isLoading && data) setLastRefreshed(new Date());
  }, [isLoading, data]);

  const problems = useMemo(() => recordsToLiveProblems(data?.records), [data?.records]);

  // Build CI lookup from application list
  const ciMap = useMemo(() => {
    const m = new Map<string, { appName: string; tier: string }>();
    for (const r of applicationList) {
      m.set(r.AppCI.toUpperCase(), { appName: r.ApplicationName ?? "", tier: r.Tier ?? "" });
    }
    return m;
  }, [applicationList]);

  // Aggregate per-CI stats
  const ciSummaries = useMemo(() => {
    const m = new Map<string, CiSummary>();
    for (const p of problems) {
      const key = p.singleAppCI;
      if (!m.has(key)) {
        const info = ciMap.get(key) ?? { appName: "", tier: "" };
        m.set(key, { ci: key, appName: info.appName, tier: info.tier, count: 0, totalRaR: 0 });
      }
      const e = m.get(key)!;
      e.count++;
      e.totalRaR += p.revenueAtRisk;
    }
    return [...m.values()].sort((a, b) => b.count - a.count || b.totalRaR - a.totalRaR);
  }, [problems, ciMap]);

  // Honeycomb cells
  const honeycombCells = useMemo((): HoneycombCell[] => {
    const activeCiSet = new Set(ciSummaries.map((s) => s.ci));
    const activeCells: HoneycombCell[] = ciSummaries.map((s) => ({
      ci: s.ci,
      appName: s.appName,
      tier: s.tier,
      problemCount: s.count,
      revenueAtRisk: s.totalRaR,
    }));

    if (!showFullPortfolio || applicationList.length === 0) return activeCells;

    const inactiveCells: HoneycombCell[] = applicationList
      .filter((r) => !activeCiSet.has(r.AppCI.toUpperCase()))
      .map((r) => ({
        ci: r.AppCI.toUpperCase(),
        appName: r.ApplicationName ?? "",
        tier: r.Tier ?? "",
        problemCount: 0,
        revenueAtRisk: 0,
      }))
      .sort((a, b) => a.ci.localeCompare(b.ci));

    return [...activeCells, ...inactiveCells];
  }, [ciSummaries, applicationList, showFullPortfolio]);

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of problems) m.set(p.category, (m.get(p.category) ?? 0) + 1);
    return [...m.entries()]
      .map(([cat, count]) => ({ cat, count }))
      .sort((a, b) => b.count - a.count);
  }, [problems]);

  // Filtered problem list for table
  const filteredProblems = useMemo(() => {
    let rows = problems;
    if (selectedCi) rows = rows.filter((p) => p.singleAppCI === selectedCi);
    if (selectedCategory) rows = rows.filter((p) => p.category === selectedCategory);
    return rows;
  }, [problems, selectedCi, selectedCategory]);

  // Summary stats
  const totalRaR = useMemo(() => problems.reduce((s, p) => s + p.revenueAtRisk, 0), [problems]);
  const uniqueCis = useMemo(() => new Set(problems.map((p) => p.singleAppCI)).size, [problems]);
  const criticalCount = useMemo(() => problems.filter((p) => p.category === "ERROR").length, [problems]);
  const avgDuration = useMemo(() => {
    if (problems.length === 0) return 0;
    return problems.reduce((s, p) => s + p.durationMs, 0) / problems.length;
  }, [problems]);

  // Table columns
  const columns = useMemo<DataTableColumnDef<LiveProblemRow>[]>(() => [
    {
      id: "id",
      header: "Problem",
      accessor: "displayId",
      width: 120,
      cell: ({ rowData }) =>
        rowData.eventId ? (
          <Link href={`${DAVIS_PROBLEM_BASE}${rowData.eventId}`} target="_blank" rel="noopener noreferrer">
            {rowData.displayId}
          </Link>
        ) : (
          <Text textStyle="small">{rowData.displayId}</Text>
        ),
    },
    {
      id: "ci",
      header: "AppCI",
      accessor: "singleAppCI",
      width: 130,
      cell: ({ rowData }) => (
        <button
          onClick={() => setSelectedCi((prev) => prev === rowData.singleAppCI ? null : rowData.singleAppCI)}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
            fontFamily: "monospace",
            fontSize: 12,
            color: Colors.Text.Neutral.Default,
            textDecoration: "underline",
            textDecorationStyle: "dotted",
            textDecorationColor: "rgba(128,128,128,0.4)",
          }}
        >
          {rowData.singleAppCI}
        </button>
      ),
    },
    {
      id: "title",
      header: "Title",
      accessor: "title",
      width: { type: "auto", maxWidth: 380 },
      cell: ({ rowData }) => (
        <button
          onClick={() => setDetailProblem(rowData)}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
            textAlign: "left",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: 380,
            display: "block",
            fontSize: 12,
            color: Colors.Text.Neutral.Default,
          }}
          title={rowData.title}
        >
          {rowData.title}
        </button>
      ),
    },
    {
      id: "category",
      header: "Category",
      accessor: "category",
      width: 140,
      cell: ({ rowData }) => {
        const meta = catMeta(rowData.category);
        return (
          <span
            style={{
              display: "inline-block",
              fontSize: 11,
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: 10,
              background: meta.bg,
              color: meta.color,
              whiteSpace: "nowrap",
            }}
          >
            {meta.label}
          </span>
        );
      },
    },
    {
      id: "duration",
      header: "Duration",
      accessor: (r: LiveProblemRow) => r.durationMs,
      width: 100,
      cell: ({ rowData }) => {
        const h = rowData.durationMs / 3_600_000;
        const color = h >= 12 ? regressionRed : h >= 4 ? "#F5A800" : undefined;
        return (
          <Text textStyle="small" style={color ? { color, fontWeight: 600 } : undefined}>
            {formatDuration(rowData.durationMs)}
          </Text>
        );
      },
    },
    {
      id: "rar",
      header: "Rev. at Risk",
      accessor: (r: LiveProblemRow) => r.revenueAtRisk,
      width: 130,
      cell: ({ rowData }) => {
        const v = rowData.revenueAtRisk;
        return (
          <Text textStyle="small" style={v > 0 ? { color: regressionRed, fontWeight: 600 } : undefined}>
            {v > 0 ? formatUsd(v) : "—"}
          </Text>
        );
      },
    },
  ], []);

  // For detail sheet enrichment
  const detailAppInfo = useMemo(() => {
    if (!detailProblem) return { appName: "", tier: "" };
    return ciMap.get(detailProblem.singleAppCI) ?? { appName: "", tier: "" };
  }, [detailProblem, ciMap]);

  const hasFilters = selectedCi !== null || selectedCategory !== null;

  // Inject pulse animation
  useEffect(() => {
    const id = "lm-pulse-style";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `@keyframes lm-pulse { 0%,100% { opacity:1; box-shadow:0 0 0 3px rgba(200,45,64,0.25); } 50% { opacity:0.55; box-shadow:0 0 0 6px rgba(200,45,64,0.08); } }`;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);

  return (
    <Flex flexDirection="column" gap={20} style={{ padding: "20px 24px" }}>

      {/* ── Header row ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <PulseDot />
          <Heading level={2} style={{ margin: 0 }}>Live Mode</Heading>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.8px",
              textTransform: "uppercase",
              color: regressionRed,
              background: "rgba(200,45,64,0.10)",
              padding: "3px 8px",
              borderRadius: 4,
            }}
          >
            Active Problems
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {lastRefreshed && (
            <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.5 }}>
              {/* ticker forces re-render for "ago" display */}
              {ticker >= 0 && `Updated ${formatAgo(lastRefreshed)}`}
            </Text>
          )}
          <Button
            variant={autoRefresh ? "default" : "default"}
            onClick={() => setAutoRefresh((v) => !v)}
            style={{
              fontSize: 12,
              background: autoRefresh ? "rgba(20,150,255,0.10)" : undefined,
              color: autoRefresh ? "#1496FF" : undefined,
              border: autoRefresh ? "1px solid rgba(20,150,255,0.35)" : undefined,
            }}
          >
            {autoRefresh ? "Auto-refresh: ON" : "Auto-refresh: OFF"}
          </Button>
          <Button
            variant="emphasized"
            onClick={() => void refetch()}
            disabled={isLoading}
          >
            {isLoading ? "Loading…" : "↻ Refresh"}
          </Button>
        </div>
      </div>

      {/* ── Error state ── */}
      {error && (
        <Surface
          style={{
            padding: "14px 18px",
            borderRadius: Borders.Radius.Container.Default,
            background: "rgba(200,45,64,0.08)",
            border: "1px solid rgba(200,45,64,0.3)",
          }}
        >
          <Text style={{ color: regressionRed }}>
            Failed to load active problems. Check your Dynatrace permissions (storage:events:read, storage:bizevents:read).
          </Text>
        </Surface>
      )}

      {/* ── Hero stats ── */}
      {!error && (
        <Grid gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))" gap={12}>
          <HeroCard
            label="Active Problems"
            value={isLoading ? "—" : formatNumber(problems.length)}
            sub={isLoading ? "Loading…" : `across ${uniqueCis} CI${uniqueCis !== 1 ? "s" : ""}`}
            accent={regressionRed}
            gradFrom="#7A0E20"
            gradTo="#C82D40"
          />
          <HeroCard
            label="Critical (Error)"
            value={isLoading ? "—" : formatNumber(criticalCount)}
            sub="ERROR category"
            accent="#E87722"
            gradFrom="#8A3A00"
            gradTo="#D94030"
          />
          <HeroCard
            label="Revenue at Risk"
            value={isLoading ? "—" : totalRaR > 0 ? formatUsd(totalRaR) : "—"}
            sub={isLoading ? undefined : "active problem exposure"}
            accent="#F5A800"
            gradFrom="#9A4000"
            gradTo="#C48800"
          />
          <HeroCard
            label="Avg Duration"
            value={isLoading ? "—" : problems.length > 0 ? formatDuration(avgDuration) : "—"}
            sub={isLoading ? undefined : "per active problem"}
            accent="#7C38A0"
            gradFrom="#3A1060"
            gradTo="#7C38A0"
          />
        </Grid>
      )}

      {/* ── Honeycomb + right panel ── */}
      {!error && !isLoading && problems.length === 0 && (
        <Surface
          style={{
            padding: "40px 24px",
            borderRadius: Borders.Radius.Container.Default,
            textAlign: "center",
            background: "rgba(115,190,40,0.06)",
            border: "1px solid rgba(115,190,40,0.2)",
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: 600, color: "#73BE28" }}>
            ✓ No active problems detected
          </Text>
          <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.6, marginTop: 6 }}>
            All monitored CIs are currently clear within the selected scope.
          </Text>
        </Surface>
      )}

      {!error && (isLoading || problems.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, alignItems: "start" }}>

          {/* Honeycomb panel */}
          <Surface
            style={{
              borderRadius: Borders.Radius.Container.Default,
              background: Colors.Background.Surface.Default,
              overflow: "hidden",
              border: `1px solid rgba(200,45,64,0.12)`,
            }}
          >
            {/* Panel header */}
            <div
              style={{
                background: "linear-gradient(135deg, #6B0A1A 0%, #9A1E2C 100%)",
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div>
                <Text style={{ color: "#fff", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px" }}>
                  Portfolio Health Map
                </Text>
                <Text style={{ color: "#fff", opacity: 0.6, fontSize: 10, marginTop: 2 }}>
                  {showFullPortfolio
                    ? `${honeycombCells.length} CIs — colored = active problems`
                    : `${honeycombCells.length} CI${honeycombCells.length !== 1 ? "s" : ""} with active problems`}
                </Text>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {selectedCi && (
                  <button
                    onClick={() => setSelectedCi(null)}
                    style={{
                      fontSize: 10,
                      color: "#fff",
                      background: "rgba(255,255,255,0.15)",
                      border: "none",
                      borderRadius: 4,
                      padding: "3px 8px",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    ✕ Clear selection
                  </button>
                )}
                {applicationList.length > 0 && (
                  <button
                    onClick={() => setShowFullPortfolio((v) => !v)}
                    style={{
                      fontSize: 10,
                      color: "#fff",
                      background: "rgba(255,255,255,0.12)",
                      border: "1px solid rgba(255,255,255,0.2)",
                      borderRadius: 4,
                      padding: "3px 8px",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    {showFullPortfolio ? "Show active only" : `Show all ${applicationList.length} CIs`}
                  </button>
                )}
              </div>
            </div>

            {/* Legend row */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 16px", borderBottom: "1px solid rgba(128,128,128,0.1)", flexWrap: "wrap" }}>
              {[
                { label: "1 problem", color: "#FEAA2F" },
                { label: "2 problems", color: "#ED6910" },
                { label: "3–4", color: "#D94030" },
                { label: "5+", color: "#9A1E2C" },
              ].map((l) => (
                <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: Colors.Text.Neutral.Default, opacity: 0.7 }}>
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: l.color }} />
                  {l.label}
                </span>
              ))}
              <Text textStyle="small" style={{ opacity: 0.45, fontSize: 10, marginLeft: "auto" }}>
                Click a cell to filter table
              </Text>
            </div>

            {/* Honeycomb */}
            <div style={{ padding: "12px 8px 12px" }}>
              {isLoading ? (
                <div style={{ padding: "40px 0", textAlign: "center" }}>
                  <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.5 }}>Loading…</Text>
                </div>
              ) : honeycombCells.length === 0 ? (
                <div style={{ padding: "40px 0", textAlign: "center" }}>
                  <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.5 }}>No data</Text>
                </div>
              ) : (
                <HoneycombChart
                  cells={honeycombCells}
                  selectedCi={selectedCi}
                  onSelect={setSelectedCi}
                />
              )}
            </div>
          </Surface>

          {/* Right panel: category breakdown + top CIs */}
          <Flex flexDirection="column" gap={12}>

            {/* Category breakdown */}
            <Surface
              style={{
                borderRadius: Borders.Radius.Container.Default,
                background: Colors.Background.Surface.Default,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  background: "linear-gradient(135deg, #1446B8 0%, #1C5BE5 100%)",
                  padding: "10px 14px",
                }}
              >
                <Text style={{ color: "#fff", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px" }}>
                  Problem Breakdown
                </Text>
              </div>
              <div style={{ padding: "12px 14px" }}>
                <CategoryBreakdownBar
                  breakdown={categoryBreakdown}
                  selectedCategory={selectedCategory}
                  onSelect={setSelectedCategory}
                />
                {categoryBreakdown.length === 0 && !isLoading && (
                  <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.45 }}>
                    No data
                  </Text>
                )}
              </div>
            </Surface>

            {/* Top CIs */}
            <Surface
              style={{
                borderRadius: Borders.Radius.Container.Default,
                background: Colors.Background.Surface.Default,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  background: "linear-gradient(135deg, #9A1E30 0%, #C82D40 100%)",
                  padding: "10px 14px",
                }}
              >
                <Text style={{ color: "#fff", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px" }}>
                  Most Affected CIs
                </Text>
                <Text style={{ color: "#fff", opacity: 0.65, fontSize: 10, marginTop: 2 }}>
                  by active problem count
                </Text>
              </div>
              <div style={{ padding: "6px 0 8px" }}>
                {isLoading ? (
                  <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.45, padding: "12px 14px" }}>
                    Loading…
                  </Text>
                ) : ciSummaries.length === 0 ? (
                  <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.45, padding: "12px 14px" }}>
                    No active problems
                  </Text>
                ) : (
                  <TopCisPanel
                    cis={ciSummaries}
                    selectedCi={selectedCi}
                    onSelect={setSelectedCi}
                  />
                )}
              </div>
            </Surface>

          </Flex>
        </div>
      )}

      {/* ── Problem table ── */}
      {!error && (isLoading || problems.length > 0) && (
        <Flex flexDirection="column" gap={8}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Text textStyle="small-emphasized">Active Problems</Text>
            {!isLoading && (
              <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.6 }}>
                {hasFilters
                  ? `${filteredProblems.length} of ${problems.length}`
                  : `${problems.length} problem${problems.length !== 1 ? "s" : ""}`}
              </Text>
            )}
            {hasFilters && (
              <button
                onClick={() => { setSelectedCi(null); setSelectedCategory(null); }}
                style={{
                  fontSize: 11,
                  color: "#1496FF",
                  background: "rgba(20,150,255,0.10)",
                  border: "none",
                  borderRadius: 4,
                  padding: "3px 8px",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                ✕ Clear filters
              </button>
            )}
          </div>
          <DataTable
            data={filteredProblems}
            columns={columns}
            loading={isLoading}
            sortable
            interactiveRows
            onActiveRowChange={(rowId) => {
              if (rowId === null) return;
              const row = filteredProblems[Number(rowId)];
              if (row) setDetailProblem(row);
            }}
            fullWidth
          >
            <DataTable.EmptyState>
              {isLoading ? "Loading active problems…" : "No problems match the current filters."}
            </DataTable.EmptyState>
          </DataTable>
        </Flex>
      )}

      {/* ── Detail sheet ── */}
      <LiveProblemSheet
        problem={detailProblem}
        appName={detailAppInfo.appName}
        tier={detailAppInfo.tier}
        onDismiss={() => setDetailProblem(null)}
      />
    </Flex>
  );
};

