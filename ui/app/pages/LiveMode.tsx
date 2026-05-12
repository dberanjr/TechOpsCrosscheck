import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Flex, Surface, Grid } from "@dynatrace/strato-components/layouts";
import { Text, Heading, Link } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Select, ToggleButtonGroup } from "@dynatrace/strato-components/forms";
import { Sheet } from "@dynatrace/strato-components/overlays";
import { DataTable, type DataTableColumnDef } from "@dynatrace/strato-components/tables";
import Colors from "@dynatrace/strato-design-tokens/colors";
import Borders from "@dynatrace/strato-design-tokens/borders";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { useCrosscheck, type ProblemScope } from "../context/CrosscheckContext";
import {
  liveActiveProblemsQuery,
  recordsToLiveProblems,
  type LiveProblemRow,
} from "../../queries/liveProblems";
import { HoneycombChart, type HoneycombCell } from "../components/HoneycombChart";
import { formatUsd, formatNumber } from "../lib/formatters";
import { regressionRed } from "../lib/colors";
import uaGlobePng from "../../assets/ua-globe-data";
import { CANONICAL_TIERS } from "../lib/parseTechOpsCsv";

const DAVIS_PROBLEM_BASE =
  "https://ual.apps.dynatrace.com/ui/apps/dynatrace.davis.problems/problem/";

// ─── types ─────────────────────────────────────────────────────────────────

interface CiInfo {
  appName: string;
  tier: string;
  director: string;
}

// Pre-enriched row passed to DataTable — plain string fields for reliable column rendering
interface EnrichedProblemRow extends LiveProblemRow {
  _appName: string;
  _director: string;
}

interface RootCauseEntry {
  name: string;
  count: number;
  cis: string[];
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
  ERROR:                  { label: "Error",          color: "#C82D40", bg: "rgba(200,45,64,0.12)" },
  SLOWDOWN:               { label: "Slowdown",        color: "#E87722", bg: "rgba(232,119,34,0.12)" },
  AVAILABILITY:           { label: "Availability",    color: "#F5A800", bg: "rgba(245,168,0,0.12)" },
  RESOURCE_CONTENTION:    { label: "Resource",        color: "#9B59B6", bg: "rgba(155,89,182,0.12)" },
  CUSTOM_ALERT:           { label: "Custom Alert",    color: "#1496FF", bg: "rgba(20,150,255,0.12)" },
  MONITORING_UNAVAILABLE: { label: "Monitoring Gap",  color: "#888",    bg: "rgba(128,128,128,0.12)" },
};

function catMeta(cat: string) {
  return CATEGORY_META[cat] ?? { label: cat, color: "#aaa", bg: "rgba(128,128,128,0.10)" };
}

function uniqueSorted(arr: string[]): string[] {
  return [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

// ─── Live Banner ────────────────────────────────────────────────────────────

const PulseDot = () => (
  <span
    style={{
      display: "inline-block",
      width: 10,
      height: 10,
      borderRadius: "50%",
      background: "#FF4A4A",
      boxShadow: "0 0 0 3px rgba(255,74,74,0.28)",
      animation: "lm-pulse 1.8s ease-in-out infinite",
      flexShrink: 0,
    }}
  />
);

const LiveBanner = ({
  isLoading,
  autoRefresh,
  lastRefreshed,
  ticker,
  onToggleAutoRefresh,
  onRefresh,
}: {
  isLoading: boolean;
  autoRefresh: boolean;
  lastRefreshed: Date | null;
  ticker: number;
  onToggleAutoRefresh: () => void;
  onRefresh: () => void;
}) => (
  <div
    style={{
      borderRadius: 10,
      overflow: "hidden",
      boxShadow: "0 6px 32px rgba(80,0,0,0.38), 0 1px 4px rgba(80,0,0,0.2)",
    }}
  >
    {/* Red/orange branded header */}
    <div
      style={{
        background: "linear-gradient(135deg, #3A0000 0%, #6B0A00 40%, #9A1800 70%, #C03200 100%)",
        padding: "20px 28px 18px",
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 20,
      }}
    >
      {/* UA logo */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <img src={uaGlobePng} alt="United Airlines logo" style={{ width: 56, height: 56, objectFit: "contain" }} />
      </div>

      {/* Divider */}
      <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.15)", flexShrink: 0 }} />

      {/* Title block */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <PulseDot />
          <span
            style={{
              color: "#fff",
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "-0.4px",
              lineHeight: 1.1,
            }}
          >
            TechOps Live Mode
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.8px",
              textTransform: "uppercase",
              color: "#FF8080",
              background: "rgba(255,100,100,0.12)",
              padding: "3px 8px",
              borderRadius: 4,
              border: "1px solid rgba(255,100,100,0.25)",
            }}
          >
            Live Data
          </span>
        </div>
        <div style={{ color: "rgba(255,255,255,0.58)", fontSize: 12, lineHeight: 1.65, maxWidth: 560 }}>
          Real-time view of active Dynatrace problems across the TechOps portfolio. Problems are
          auto-refreshed every 60 seconds. Click a cell or table row to drill into details.
        </div>
      </div>

      {/* Refresh controls */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={onToggleAutoRefresh}
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: autoRefresh ? "#90FF90" : "rgba(255,255,255,0.5)",
              background: autoRefresh ? "rgba(100,255,100,0.10)" : "rgba(255,255,255,0.07)",
              border: `1px solid ${autoRefresh ? "rgba(100,255,100,0.25)" : "rgba(255,255,255,0.12)"}`,
              borderRadius: 5,
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            {autoRefresh ? "⏸ Auto-refresh ON" : "▶ Auto-refresh OFF"}
          </button>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: isLoading ? "rgba(255,255,255,0.3)" : "#fff",
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 5,
              padding: "4px 12px",
              cursor: isLoading ? "default" : "pointer",
            }}
          >
            {isLoading ? "Loading…" : "↻ Refresh"}
          </button>
        </div>
        {lastRefreshed && (
          <Text
            textStyle="small"
            style={{ color: "rgba(255,255,255,0.38)", fontSize: 10 }}
          >
            {ticker >= 0 && `Updated ${formatAgo(lastRefreshed)}`}
          </Text>
        )}
      </div>
    </div>

    {/* Filter bar */}
    <LiveFilterBarInner />
  </div>
);

// ─── Filter bar ─────────────────────────────────────────────────────────────

const LiveFilterBarContext = React.createContext<{
  localCiFilter: string[];
  localTierFilter: string[];
  localDirectorFilter: string[];
  setLocalCiFilter: (v: string[]) => void;
  setLocalTierFilter: (v: string[]) => void;
  setLocalDirectorFilter: (v: string[]) => void;
} | null>(null);

const LiveFilterBarInner = () => {
  const ctx = React.useContext(LiveFilterBarContext);
  const { applicationList, problemScope, setProblemScope } = useCrosscheck();

  const tierOptions = useMemo(
    () => uniqueSorted(applicationList.map((r) => r.Tier)),
    [applicationList],
  );
  const directorOptions = useMemo(
    () => uniqueSorted(applicationList.map((r) => r.Director)),
    [applicationList],
  );
  const ciOptions = useMemo(() => {
    const tierSet = new Set(ctx?.localTierFilter ?? []);
    const dirSet = new Set(ctx?.localDirectorFilter ?? []);
    const filtered = applicationList.filter((r) => {
      if (tierSet.size > 0 && !tierSet.has(r.Tier)) return false;
      if (dirSet.size > 0 && !dirSet.has(r.Director)) return false;
      return true;
    });
    return uniqueSorted(filtered.map((r) => r.AppCI));
  }, [applicationList, ctx?.localTierFilter, ctx?.localDirectorFilter]);

  if (!ctx) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        flexWrap: "wrap",
        gap: 14,
        padding: "12px 20px",
        background: Colors.Background.Surface.Default,
        borderTop: "1px solid rgba(180,60,20,0.15)",
      }}
    >
      {/* Problem type */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Text textStyle="small-emphasized" style={{ fontSize: 11 }}>Problem type</Text>
        <ToggleButtonGroup value={problemScope} onChange={(v) => setProblemScope(v as ProblemScope)}>
          <ToggleButtonGroup.Item value="business">Business impacting</ToggleButtonGroup.Item>
          <ToggleButtonGroup.Item value="operational">Operational</ToggleButtonGroup.Item>
          <ToggleButtonGroup.Item value="all">All</ToggleButtonGroup.Item>
        </ToggleButtonGroup>
      </div>

      {/* Tier */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Text textStyle="small-emphasized" style={{ fontSize: 11 }}>Tier</Text>
        <Select
          multiple
          value={ctx.localTierFilter}
          onChange={(v) => ctx.setLocalTierFilter(Array.isArray(v) ? v : [])}
          clearable
          disabled={tierOptions.length === 0}
        >
          <Select.Trigger placeholder="All tiers" />
          <Select.Content>
            {(tierOptions.length > 0 ? tierOptions : (CANONICAL_TIERS as readonly string[])).map((t: string) => (
              <Select.Option key={t} value={t}>{t}</Select.Option>
            ))}
          </Select.Content>
        </Select>
      </div>

      {/* Director / App Owner */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Text textStyle="small-emphasized" style={{ fontSize: 11 }}>App Owner</Text>
        <Select
          multiple
          value={ctx.localDirectorFilter}
          onChange={(v) => ctx.setLocalDirectorFilter(Array.isArray(v) ? v : [])}
          clearable
          disabled={directorOptions.length === 0}
        >
          <Select.Trigger placeholder="All owners" />
          <Select.Content>
            {directorOptions.map((d) => (
              <Select.Option key={d} value={d}>{d}</Select.Option>
            ))}
          </Select.Content>
        </Select>
      </div>

      {/* AppCI */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Text textStyle="small-emphasized" style={{ fontSize: 11 }}>Application CI</Text>
        <Select
          multiple
          value={ctx.localCiFilter}
          onChange={(v) => ctx.setLocalCiFilter(Array.isArray(v) ? v : [])}
          clearable
          disabled={ciOptions.length === 0}
        >
          <Select.Trigger placeholder="All CIs" />
          <Select.Content>
            <Select.Filter />
            {ciOptions.map((ci) => (
              <Select.Option key={ci} value={ci}>{ci}</Select.Option>
            ))}
          </Select.Content>
        </Select>
      </div>
    </div>
  );
};

// ─── Hero stat card ─────────────────────────────────────────────────────────

const HeroCard = ({
  label, value, sub, gradFrom, gradTo, accent,
}: {
  label: string; value: string; sub?: string; gradFrom: string; gradTo: string; accent: string;
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
    <Text style={{ color: "#fff", fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{value}</Text>
    {sub && <Text style={{ color: "#fff", opacity: 0.6, fontSize: 10, marginTop: 2 }}>{sub}</Text>}
  </Surface>
);

// ─── Category breakdown ──────────────────────────────────────────────────────

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
      <div style={{ display: "flex", height: 7, borderRadius: 4, overflow: "hidden", marginBottom: 10 }}>
        {breakdown.map(({ cat, count }) => {
          const m = catMeta(cat);
          return <div key={cat} style={{ flex: count, background: m.color, opacity: 0.85 }} title={`${m.label}: ${count}`} />;
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {breakdown.map(({ cat, count }) => {
          const m = catMeta(cat);
          const active = selectedCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => onSelect(active ? null : cat)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 11px",
                borderRadius: 20,
                border: active ? `1.5px solid ${m.color}` : `1px solid ${m.color}44`,
                background: active ? m.bg : "transparent",
                cursor: "pointer",
                transition: "all 120ms",
                fontSize: 11,
                fontWeight: active ? 700 : 500,
                color: active ? m.color : Colors.Text.Neutral.Default,
                whiteSpace: "nowrap",
              }}
            >
              <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
              {m.label}
              <span style={{ opacity: 0.75, fontSize: 10 }}>({count})</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ─── Top affected CIs panel ───────────────────────────────────────────────────

interface CiSummary { ci: string; appName: string; tier: string; director: string; count: number; totalRaR: number }

const TopCisPanel = ({
  cis,
  selectedCi,
  onSelect,
}: {
  cis: CiSummary[];
  selectedCi: string | null;
  onSelect: (ci: string | null) => void;
}) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
    {cis.slice(0, 6).map((e, i) => {
      const isActive = selectedCi === e.ci;
      return (
        <button
          key={e.ci}
          onClick={() => onSelect(isActive ? null : e.ci)}
          style={{
            display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 10px",
            background: isActive ? "rgba(200,45,64,0.10)" : "transparent",
            border: "none",
            borderLeft: isActive ? `3px solid ${regressionRed}` : "3px solid transparent",
            cursor: "pointer", borderRadius: isActive ? "0 6px 6px 0" : 0,
            textAlign: "left", width: "100%", transition: "background 120ms",
          }}
          onMouseEnter={(e2) => { if (!isActive) (e2.currentTarget as HTMLButtonElement).style.background = "rgba(128,128,128,0.07)"; }}
          onMouseLeave={(e2) => { if (!isActive) (e2.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", background: isActive ? regressionRed : "rgba(200,45,64,0.3)", color: "#fff", fontSize: 9, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>
            {i + 1}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 4, alignItems: "baseline" }}>
              <Text textStyle="small-emphasized" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "monospace", fontSize: 11 }}>
                {e.ci}
              </Text>
              <Text textStyle="small" style={{ color: regressionRed, fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
                {e.count} {e.count === 1 ? "prob" : "probs"}
              </Text>
            </div>
            {e.appName && (
              <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.5, fontSize: 10, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {e.appName}
              </Text>
            )}
            {e.totalRaR > 0 && (
              <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.45, fontSize: 10 }}>
                {formatUsd(e.totalRaR)} at risk
              </Text>
            )}
          </div>
        </button>
      );
    })}
  </div>
);

// ─── Root causes tile ──────────────────────────────────────────────────────

const LiveRootCauseTile = ({
  rootCauses,
  selectedRootCause,
  onSelect,
}: {
  rootCauses: RootCauseEntry[];
  selectedRootCause: string | null;
  onSelect: (rc: string | null) => void;
}) => (
  <Surface
    style={{
      borderRadius: Borders.Radius.Container.Default,
      background: Colors.Background.Surface.Default,
      overflow: "hidden",
    }}
  >
    <div style={{ background: "linear-gradient(135deg, #0B6BC9 0%, #1496FF 100%)", padding: "10px 14px" }}>
      <Text style={{ color: "#fff", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px" }}>
        Top Root Causes
      </Text>
      <Text style={{ color: "#fff", opacity: 0.65, fontSize: 10, marginTop: 2 }}>
        click to filter problems
      </Text>
    </div>
    <div style={{ padding: "6px 0 8px" }}>
      {rootCauses.length === 0 ? (
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.4, padding: "12px 14px" }}>
          No root cause data
        </Text>
      ) : (
        rootCauses.slice(0, 5).map((rc, i) => {
          const isActive = selectedRootCause === rc.name;
          return (
            <button
              key={rc.name}
              onClick={() => onSelect(isActive ? null : rc.name)}
              style={{
                display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 10px",
                background: isActive ? "rgba(20,150,255,0.10)" : "transparent",
                border: "none",
                borderLeft: isActive ? "3px solid #1496FF" : "3px solid transparent",
                cursor: "pointer", textAlign: "left", width: "100%", transition: "background 120ms",
              }}
              onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "rgba(128,128,128,0.07)"; }}
              onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", background: isActive ? "#1496FF" : "rgba(20,150,255,0.25)", color: "#fff", fontSize: 9, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>
                {i + 1}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 4, alignItems: "baseline" }}>
                  <Text textStyle="small-emphasized" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, color: isActive ? "#1496FF" : undefined }}>
                    {rc.name}
                  </Text>
                  <Text textStyle="small" style={{ color: isActive ? "#1496FF" : Colors.Text.Neutral.Default, fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
                    {rc.count}
                  </Text>
                </div>
                <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.45, fontSize: 10 }}>
                  {rc.cis.length} CI{rc.cis.length !== 1 ? "s" : ""}
                  {rc.totalRaR > 0 ? ` · ${formatUsd(rc.totalRaR)}` : ""}
                </Text>
              </div>
            </button>
          );
        })
      )}
      {selectedRootCause && (
        <button
          onClick={() => onSelect(null)}
          style={{ fontSize: 10, color: "#1496FF", background: "rgba(20,150,255,0.08)", border: "none", borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontWeight: 600, margin: "4px 10px" }}
        >
          ✕ Clear filter
        </button>
      )}
    </div>
  </Surface>
);

// ─── Problem detail sheet ──────────────────────────────────────────────────

const LiveProblemSheet = ({
  problem, ciInfo, onDismiss,
}: {
  problem: LiveProblemRow | null;
  ciInfo: CiInfo;
  onDismiss: () => void;
}) => {
  if (!problem) return null;
  const cat = catMeta(problem.category);
  const dtLink = problem.eventId ? `${DAVIS_PROBLEM_BASE}${problem.eventId}` : null;

  const stats = [
    { label: "Duration",       value: formatDuration(problem.durationMs),                            grad: ["#C48800", "#F5A800"] as [string, string] },
    { label: "Revenue at Risk", value: problem.revenueAtRisk > 0 ? formatUsd(problem.revenueAtRisk) : "—", grad: ["#9A1E30", "#C82D40"] as [string, string] },
    { label: "Daily Loss Rate", value: problem.avgDailyLoss > 0 ? formatUsd(problem.avgDailyLoss) + "/day" : "—", grad: ["#A04900", "#E87722"] as [string, string] },
  ];

  const infoRows: Array<[string, string]> = [
    ["AppCI",      problem.singleAppCI],
    ...(ciInfo.appName  ? [["App Name",  ciInfo.appName]  as [string, string]] : []),
    ...(ciInfo.tier     ? [["Tier",      ciInfo.tier]     as [string, string]] : []),
    ...(ciInfo.director ? [["App Owner", ciInfo.director] as [string, string]] : []),
    ...(problem.rootCause ? [["Root Cause Entity", problem.rootCause] as [string, string]] : []),
    ...(problem.impactLevel ? [["Impact Level", problem.impactLevel] as [string, string]] : []),
    ["Category",   cat.label],
    ["Started",    problem.problemStart ? new Date(problem.problemStart).toLocaleString() : "—"],
  ];

  return (
    <Sheet
      show={problem !== null}
      title={problem.displayId}
      onDismiss={onDismiss}
      actions={<Button onClick={onDismiss} variant="default">Close</Button>}
    >
      <Flex flexDirection="column" gap={20} padding={16}>
        {/* Title + badges */}
        <Flex flexDirection="column" gap={6}>
          <Heading level={4} style={{ margin: 0 }}>{problem.title}</Heading>
          <Flex alignItems="center" gap={8} flexFlow="wrap">
            <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 10, background: cat.bg, color: cat.color }}>
              {cat.label}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 10, background: "rgba(200,45,64,0.12)", color: regressionRed }}>
              ACTIVE
            </span>
          </Flex>
        </Flex>

        {/* Stat cards */}
        <Grid gridTemplateColumns="repeat(3, 1fr)" gap={12}>
          {stats.map((s) => (
            <Surface key={s.label} style={{ background: `linear-gradient(135deg, ${s.grad[0]} 0%, ${s.grad[1]} 100%)`, borderRadius: Borders.Radius.Container.Default, padding: "12px 14px", overflow: "hidden" }}>
              <Text style={{ color: "#fff", opacity: 0.8, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 600 }}>{s.label}</Text>
              <Text style={{ color: "#fff", fontSize: 18, fontWeight: 700, lineHeight: 1.2, marginTop: 4 }}>{s.value}</Text>
            </Surface>
          ))}
        </Grid>

        {/* App info grid */}
        <Surface style={{ padding: "14px 16px", borderRadius: Borders.Radius.Container.Default, background: "rgba(128,128,128,0.04)", border: "1px solid rgba(128,128,128,0.12)" }}>
          <Flex flexDirection="column" gap={8}>
            <Text textStyle="small-emphasized" style={{ color: Colors.Text.Neutral.Default, opacity: 0.55, textTransform: "uppercase", fontSize: 10, letterSpacing: "0.5px" }}>Application Details</Text>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 6, columnGap: 16, fontSize: 12 }}>
              {infoRows.map(([label, value]) => (
                <React.Fragment key={label}>
                  <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.5 }}>{label}</Text>
                  <Text textStyle="small" style={label === "AppCI" ? { fontFamily: "monospace", fontWeight: 600 } : undefined}>{value}</Text>
                </React.Fragment>
              ))}
            </div>
          </Flex>
        </Surface>

        {dtLink && (
          <Flex gap={8}>
            <Link href={dtLink} target="_blank" rel="noopener noreferrer">View in Dynatrace →</Link>
          </Flex>
        )}
      </Flex>
    </Sheet>
  );
};

// ─── Main page ─────────────────────────────────────────────────────────────

export const LiveMode = () => {
  const { appCiFilter, problemScope, applicationList } = useCrosscheck();

  // Refresh state
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [ticker, setTicker] = useState(0);

  // View filters (local — don't touch global context)
  const [localCiFilter, setLocalCiFilter] = useState<string[]>([]);
  const [localTierFilter, setLocalTierFilter] = useState<string[]>([]);
  const [localDirectorFilter, setLocalDirectorFilter] = useState<string[]>([]);

  // Drill-down state
  const [selectedCi, setSelectedCi] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedRootCause, setSelectedRootCause] = useState<string | null>(null);
  const [detailProblem, setDetailProblem] = useState<LiveProblemRow | null>(null);
  const [showFullPortfolio, setShowFullPortfolio] = useState(false);

  // DQL query
  const query = useMemo(
    () => liveActiveProblemsQuery({ appCiFilter, problemScope }),
    [appCiFilter, problemScope],
  );
  const { data, isLoading, error, refetch } = useDql({
    query,
    defaultScanLimitGbytes: -1,
    requestTimeoutMilliseconds: 60_000,
  });

  // Ticker for "X ago" display
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

  // Pulse animation injection
  useEffect(() => {
    const id = "lm-pulse-style";
    if (document.getElementById(id)) return;
    const s = document.createElement("style");
    s.id = id;
    s.textContent = `@keyframes lm-pulse { 0%,100%{opacity:1;box-shadow:0 0 0 3px rgba(255,74,74,0.28)} 50%{opacity:0.5;box-shadow:0 0 0 7px rgba(255,74,74,0.06)} }`;
    document.head.appendChild(s);
    return () => { s.remove(); };
  }, []);

  // Data processing
  const problems = useMemo(() => recordsToLiveProblems(data?.records), [data?.records]);

  // CI lookup map from applicationList (same source as Crosscheck tab)
  const ciMap = useMemo(() => {
    const m = new Map<string, CiInfo>();
    for (const r of applicationList) {
      m.set(r.AppCI.toUpperCase(), { appName: r.ApplicationName ?? "", tier: r.Tier ?? "", director: r.Director ?? "" });
    }
    return m;
  }, [applicationList]);

  // Per-CI aggregation
  const ciSummaries = useMemo((): CiSummary[] => {
    const m = new Map<string, CiSummary>();
    for (const p of problems) {
      const key = p.singleAppCI;
      if (!m.has(key)) {
        const info = ciMap.get(key) ?? { appName: "", tier: "", director: "" };
        m.set(key, { ci: key, appName: info.appName, tier: info.tier, director: info.director, count: 0, totalRaR: 0 });
      }
      const e = m.get(key)!;
      e.count++;
      e.totalRaR += p.revenueAtRisk;
    }
    return [...m.values()].sort((a, b) => b.count - a.count || b.totalRaR - a.totalRaR);
  }, [problems, ciMap]);

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of problems) m.set(p.category, (m.get(p.category) ?? 0) + 1);
    return [...m.entries()].map(([cat, count]) => ({ cat, count })).sort((a, b) => b.count - a.count);
  }, [problems]);

  // Root causes
  const rootCauses = useMemo((): RootCauseEntry[] => {
    const m = new Map<string, { count: number; cis: Set<string>; totalRaR: number }>();
    for (const p of problems) {
      if (!p.rootCause) continue;
      if (!m.has(p.rootCause)) m.set(p.rootCause, { count: 0, cis: new Set(), totalRaR: 0 });
      const e = m.get(p.rootCause)!;
      e.count++;
      e.cis.add(p.singleAppCI);
      e.totalRaR += p.revenueAtRisk;
    }
    return [...m.entries()]
      .map(([name, v]) => ({ name, count: v.count, cis: [...v.cis], totalRaR: v.totalRaR }))
      .sort((a, b) => b.count - a.count);
  }, [problems]);

  // Honeycomb cells (enriched)
  const honeycombCells = useMemo((): HoneycombCell[] => {
    const activeCiSet = new Set(ciSummaries.map((s) => s.ci));
    const activeCells: HoneycombCell[] = ciSummaries.map((s) => {
      // Per-CI category counts
      const cats: Record<string, number> = {};
      for (const p of problems) {
        if (p.singleAppCI !== s.ci) continue;
        cats[p.category] = (cats[p.category] ?? 0) + 1;
      }
      const starts = problems.filter((p) => p.singleAppCI === s.ci).map((p) => p.problemStart).filter(Boolean);
      const oldestStart = starts.length > 0 ? starts.reduce((a, b) => (a < b ? a : b)) : undefined;
      return {
        ci: s.ci,
        appName: s.appName,
        tier: s.tier,
        director: s.director,
        problemCount: s.count,
        revenueAtRisk: s.totalRaR,
        categories: cats,
        oldestStart,
      };
    });

    if (!showFullPortfolio || applicationList.length === 0) return activeCells;

    const inactiveCells: HoneycombCell[] = applicationList
      .filter((r) => !activeCiSet.has(r.AppCI.toUpperCase()))
      .map((r) => ({
        ci: r.AppCI.toUpperCase(),
        appName: r.ApplicationName ?? "",
        tier: r.Tier ?? "",
        director: r.Director ?? "",
        problemCount: 0,
        revenueAtRisk: 0,
      }))
      .sort((a, b) => a.ci.localeCompare(b.ci));

    return [...activeCells, ...inactiveCells];
  }, [ciSummaries, applicationList, showFullPortfolio, problems]);

  // Final filtered problems for table (apply all filters)
  const filteredProblems = useMemo(() => {
    let rows = problems;
    if (localCiFilter.length > 0) {
      const s = new Set(localCiFilter.map((c) => c.toUpperCase()));
      rows = rows.filter((p) => s.has(p.singleAppCI));
    }
    if (localTierFilter.length > 0) {
      const s = new Set(localTierFilter);
      rows = rows.filter((p) => s.has(ciMap.get(p.singleAppCI)?.tier ?? ""));
    }
    if (localDirectorFilter.length > 0) {
      const s = new Set(localDirectorFilter);
      rows = rows.filter((p) => s.has(ciMap.get(p.singleAppCI)?.director ?? ""));
    }
    if (selectedCategory) rows = rows.filter((p) => p.category === selectedCategory);
    if (selectedCi) rows = rows.filter((p) => p.singleAppCI === selectedCi);
    if (selectedRootCause) rows = rows.filter((p) => p.rootCause === selectedRootCause);
    return rows;
  }, [problems, localCiFilter, localTierFilter, localDirectorFilter, selectedCategory, selectedCi, selectedRootCause, ciMap]);

  // Summary stats
  const totalRaR = useMemo(() => problems.reduce((s, p) => s + p.revenueAtRisk, 0), [problems]);
  const uniqueCis = useMemo(() => new Set(problems.map((p) => p.singleAppCI)).size, [problems]);
  const criticalCount = useMemo(() => problems.filter((p) => p.category === "ERROR").length, [problems]);
  const avgDuration = useMemo(() => problems.length === 0 ? 0 : problems.reduce((s, p) => s + p.durationMs, 0) / problems.length, [problems]);

  // Enrich filtered rows with CI metadata so every column uses a plain string accessor
  const enrichedProblems = useMemo<EnrichedProblemRow[]>(
    () => filteredProblems.map((p) => {
      const info = ciMap.get(p.singleAppCI);
      return { ...p, _appName: info?.appName ?? "", _director: info?.director ?? "" };
    }),
    [filteredProblems, ciMap],
  );

  // All columns have explicit pixel widths — no auto columns that DataTable can silently drop
  const columns = useMemo<DataTableColumnDef<EnrichedProblemRow>[]>(() => [
    {
      id: "id",
      header: "Problem",
      accessor: "displayId",
      width: 115,
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
      width: 120,
      cell: ({ rowData }) => (
        <button
          onClick={() => setSelectedCi((prev) => prev === rowData.singleAppCI ? null : rowData.singleAppCI)}
          style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, fontFamily: "monospace", fontSize: 12, color: Colors.Text.Neutral.Default, textDecoration: "underline dotted rgba(128,128,128,0.4)", textUnderlineOffset: 2 }}
        >
          {rowData.singleAppCI}
        </button>
      ),
    },
    {
      id: "appName",
      header: "App Name",
      accessor: "_appName",
      width: 180,
      cell: ({ rowData }) => (
        <Text textStyle="small" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: rowData._appName ? 1 : 0.3 }}>
          {rowData._appName || "—"}
        </Text>
      ),
    },
    {
      id: "owner",
      header: "App Owner",
      accessor: "_director",
      width: 150,
      cell: ({ rowData }) => (
        <Text textStyle="small" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: rowData._director ? 1 : 0.3 }}>
          {rowData._director || "—"}
        </Text>
      ),
    },
    {
      id: "rootCause",
      header: "Root Cause Entity",
      accessor: "rootCause",
      width: 200,
      cell: ({ rowData }) => (
        <Text textStyle="small" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: rowData.rootCause ? 1 : 0.3 }}>
          {rowData.rootCause ?? "—"}
        </Text>
      ),
    },
    {
      id: "title",
      header: "Title",
      accessor: "title",
      width: 280,
      cell: ({ rowData }) => (
        <button
          onClick={() => setDetailProblem(rowData)}
          style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%", display: "block", fontSize: 12, color: Colors.Text.Neutral.Default }}
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
      width: 125,
      cell: ({ rowData }) => {
        const m = catMeta(rowData.category);
        return <span style={{ display: "inline-block", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: m.bg, color: m.color, whiteSpace: "nowrap" }}>{m.label}</span>;
      },
    },
    {
      id: "duration",
      header: "Duration",
      accessor: "durationMs",
      width: 90,
      cell: ({ rowData }) => {
        const h = rowData.durationMs / 3_600_000;
        const color = h >= 12 ? regressionRed : h >= 4 ? "#F5A800" : undefined;
        return <Text textStyle="small" style={color ? { color, fontWeight: 600 } : undefined}>{formatDuration(rowData.durationMs)}</Text>;
      },
    },
    {
      id: "rar",
      header: "Rev. at Risk",
      accessor: "revenueAtRisk",
      width: 115,
      cell: ({ rowData }) => {
        const v = rowData.revenueAtRisk;
        return <Text textStyle="small" style={v > 0 ? { color: regressionRed, fontWeight: 600 } : undefined}>{v > 0 ? formatUsd(v) : "—"}</Text>;
      },
    },
  ], []);

  // Detail sheet enrichment
  const detailCiInfo = useMemo<CiInfo>(() => {
    if (!detailProblem) return { appName: "", tier: "", director: "" };
    return ciMap.get(detailProblem.singleAppCI) ?? { appName: "", tier: "", director: "" };
  }, [detailProblem, ciMap]);

  const hasFilters = selectedCi !== null || selectedCategory !== null || selectedRootCause !== null
    || localCiFilter.length > 0 || localTierFilter.length > 0 || localDirectorFilter.length > 0;

  const clearAllFilters = useCallback(() => {
    setSelectedCi(null);
    setSelectedCategory(null);
    setSelectedRootCause(null);
    setLocalCiFilter([]);
    setLocalTierFilter([]);
    setLocalDirectorFilter([]);
  }, []);

  // Context value for filter bar
  const filterCtxValue = useMemo(() => ({
    localCiFilter, localTierFilter, localDirectorFilter,
    setLocalCiFilter, setLocalTierFilter, setLocalDirectorFilter,
  }), [localCiFilter, localTierFilter, localDirectorFilter]);

  return (
    <LiveFilterBarContext.Provider value={filterCtxValue}>
      <Flex flexDirection="column" gap={20} style={{ padding: "20px 24px" }}>

        {/* ── Banner ── */}
        <LiveBanner
          isLoading={isLoading}
          autoRefresh={autoRefresh}
          lastRefreshed={lastRefreshed}
          ticker={ticker}
          onToggleAutoRefresh={() => setAutoRefresh((v) => !v)}
          onRefresh={() => void refetch()}
        />

        {/* ── Error ── */}
        {error && (
          <Surface style={{ padding: "14px 18px", borderRadius: Borders.Radius.Container.Default, background: "rgba(200,45,64,0.08)", border: "1px solid rgba(200,45,64,0.3)" }}>
            <Text style={{ color: regressionRed }}>
              Failed to load active problems. Check permissions (storage:events:read, storage:bizevents:read).
            </Text>
          </Surface>
        )}

        {/* ── Hero stats ── */}
        {!error && (
          <Grid gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))" gap={12}>
            <HeroCard label="Active Problems"  value={isLoading ? "—" : formatNumber(problems.length)} sub={isLoading ? "Loading…" : `across ${uniqueCis} CI${uniqueCis !== 1 ? "s" : ""}`} accent={regressionRed} gradFrom="#7A0E20" gradTo="#C82D40" />
            <HeroCard label="Critical (Error)" value={isLoading ? "—" : formatNumber(criticalCount)} sub="ERROR category" accent="#E87722" gradFrom="#8A3A00" gradTo="#D94030" />
            <HeroCard label="Revenue at Risk"  value={isLoading ? "—" : totalRaR > 0 ? formatUsd(totalRaR) : "—"} sub="active problem exposure" accent="#F5A800" gradFrom="#9A4000" gradTo="#C48800" />
            <HeroCard label="Avg Duration"     value={isLoading ? "—" : problems.length > 0 ? formatDuration(avgDuration) : "—"} sub="per active problem" accent="#9B59B6" gradFrom="#3A1060" gradTo="#7C38A0" />
          </Grid>
        )}

        {/* ── All clear ── */}
        {!error && !isLoading && problems.length === 0 && (
          <Surface style={{ padding: "40px 24px", borderRadius: Borders.Radius.Container.Default, textAlign: "center", background: "rgba(115,190,40,0.06)", border: "1px solid rgba(115,190,40,0.2)" }}>
            <Text style={{ fontSize: 16, fontWeight: 600, color: "#73BE28" }}>✓ No active problems detected</Text>
            <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.6, marginTop: 6, display: "block" }}>
              All monitored CIs are currently clear within the selected scope.
            </Text>
          </Surface>
        )}

        {/* ── Honeycomb + right panel ── */}
        {!error && (isLoading || problems.length > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, alignItems: "start" }}>

            {/* Honeycomb */}
            <Surface style={{ borderRadius: Borders.Radius.Container.Default, background: "rgba(8,9,14,0.97)", overflow: "hidden", border: "1px solid rgba(200,45,64,0.18)" }}>
              <div style={{ background: "linear-gradient(135deg, #4A0800 0%, #7A1200 60%, #9A1800 100%)", padding: "11px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <Text style={{ color: "#fff", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px" }}>Portfolio Health Map</Text>
                  <Text style={{ color: "#fff", opacity: 0.6, fontSize: 10, marginTop: 2 }}>
                    {showFullPortfolio ? `${honeycombCells.length} CIs — colored = active problems` : `${honeycombCells.length} CI${honeycombCells.length !== 1 ? "s" : ""} with active problems`}
                  </Text>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {selectedCi && (
                    <button onClick={() => setSelectedCi(null)} style={{ fontSize: 10, color: "#fff", background: "rgba(255,255,255,0.12)", border: "none", borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontWeight: 600 }}>
                      ✕ Clear
                    </button>
                  )}
                  {applicationList.length > 0 && (
                    <button onClick={() => setShowFullPortfolio((v) => !v)} style={{ fontSize: 10, color: "#fff", background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontWeight: 600 }}>
                      {showFullPortfolio ? "Active only" : `All ${applicationList.length} CIs`}
                    </button>
                  )}
                </div>
              </div>

              {/* Legend */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "7px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexWrap: "wrap" }}>
                {[{ label: "1", color: "#ECA010" }, { label: "2", color: "#D05800" }, { label: "3–4", color: "#C23000" }, { label: "5+", color: "#A01010" }].map((l) => (
                  <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "rgba(255,255,255,0.45)" }}>
                    <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: l.color }} />
                    {l.label} problem{l.label === "1" ? "" : "s"}
                  </span>
                ))}
                <Text textStyle="small" style={{ opacity: 0.35, fontSize: 9, color: "rgba(255,255,255,0.4)", marginLeft: "auto" }}>
                  click to filter · $ = revenue at risk
                </Text>
              </div>

              <div style={{ padding: "10px 6px 8px" }}>
                {isLoading ? (
                  <div style={{ padding: "40px 0", textAlign: "center" }}>
                    <Text textStyle="small" style={{ color: "rgba(255,255,255,0.25)" }}>Loading…</Text>
                  </div>
                ) : (
                  <HoneycombChart cells={honeycombCells} selectedCi={selectedCi} onSelect={setSelectedCi} />
                )}
              </div>
            </Surface>

            {/* Right panel: 3 tiles stacked */}
            <Flex flexDirection="column" gap={12}>

              {/* Category breakdown */}
              <Surface style={{ borderRadius: Borders.Radius.Container.Default, background: Colors.Background.Surface.Default, overflow: "hidden" }}>
                <div style={{ background: "linear-gradient(135deg, #1446B8 0%, #1C5BE5 100%)", padding: "10px 14px" }}>
                  <Text style={{ color: "#fff", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px" }}>Problem Breakdown</Text>
                </div>
                <div style={{ padding: "12px 14px" }}>
                  <CategoryBreakdownBar breakdown={categoryBreakdown} selectedCategory={selectedCategory} onSelect={setSelectedCategory} />
                  {categoryBreakdown.length === 0 && !isLoading && (
                    <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.4 }}>No data</Text>
                  )}
                </div>
              </Surface>

              {/* Most affected CIs */}
              <Surface style={{ borderRadius: Borders.Radius.Container.Default, background: Colors.Background.Surface.Default, overflow: "hidden" }}>
                <div style={{ background: "linear-gradient(135deg, #9A1E30 0%, #C82D40 100%)", padding: "10px 14px" }}>
                  <Text style={{ color: "#fff", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px" }}>Most Affected CIs</Text>
                </div>
                <div style={{ padding: "6px 0 8px" }}>
                  {isLoading ? (
                    <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.4, padding: "12px 14px" }}>Loading…</Text>
                  ) : ciSummaries.length === 0 ? (
                    <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.4, padding: "12px 14px" }}>No active problems</Text>
                  ) : (
                    <TopCisPanel cis={ciSummaries} selectedCi={selectedCi} onSelect={setSelectedCi} />
                  )}
                </div>
              </Surface>

              {/* Root causes */}
              <LiveRootCauseTile rootCauses={rootCauses} selectedRootCause={selectedRootCause} onSelect={setSelectedRootCause} />

            </Flex>
          </div>
        )}

        {/* ── Problem table ── */}
        {!error && (isLoading || problems.length > 0) && (
          <Flex flexDirection="column" gap={8}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Text textStyle="small-emphasized">Active Problems</Text>
              {!isLoading && (
                <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, opacity: 0.55 }}>
                  {hasFilters ? `${filteredProblems.length} of ${problems.length}` : `${problems.length} problem${problems.length !== 1 ? "s" : ""}`}
                </Text>
              )}
              {hasFilters && (
                <button onClick={clearAllFilters} style={{ fontSize: 11, color: "#1496FF", background: "rgba(20,150,255,0.10)", border: "none", borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontWeight: 600 }}>
                  ✕ Clear all filters
                </button>
              )}
            </div>
            <DataTable
              data={enrichedProblems}
              columns={columns}
              loading={isLoading}
              sortable
              interactiveRows
              onActiveRowChange={(rowId) => {
                if (rowId === null) return;
                const row = enrichedProblems[Number(rowId)];
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
        <LiveProblemSheet problem={detailProblem} ciInfo={detailCiInfo} onDismiss={() => setDetailProblem(null)} />
      </Flex>
    </LiveFilterBarContext.Provider>
  );
};
