import React, { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatUsd } from "../lib/formatters";

const CAT_COLORS: Record<string, string> = {
  ERROR: "#C82D40",
  SLOWDOWN: "#E87722",
  AVAILABILITY: "#F5A800",
  RESOURCE_CONTENTION: "#9B59B6",
  CUSTOM_ALERT: "#1496FF",
  MONITORING_UNAVAILABLE: "#888",
};

function catLabel(cat: string): string {
  const MAP: Record<string, string> = {
    ERROR: "Err",
    SLOWDOWN: "Slow",
    AVAILABILITY: "Avail",
    RESOURCE_CONTENTION: "Res",
    CUSTOM_ALERT: "Alert",
    MONITORING_UNAVAILABLE: "Mon",
  };
  return MAP[cat] ?? cat.slice(0, 4);
}

export interface HoneycombCell {
  ci: string;
  appName?: string;
  tier?: string;
  director?: string;
  problemCount: number;
  revenueAtRisk: number;
  categories?: Record<string, number>;
  oldestStart?: string;
}

interface HoneycombChartProps {
  cells: HoneycombCell[];
  selectedCi?: string | null;
  onSelect?: (ci: string | null) => void;
}

// ── Flat-top hex geometry ─────────────────────────────────────────────────
const R = 30;
const HEX_W = 2 * R;                 // 60 — tip to tip
const HEX_H = Math.sqrt(3) * R;      // ≈52 — flat to flat
const COL_STEP = 1.5 * R;            // 45 — horizontal spacing
const ROW_STEP = HEX_H;              // ≈52 — vertical spacing
const PAD = R + 10;

function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

function sevFill(n: number): string {
  if (n === 0) return "rgba(180,180,200,0.06)";
  if (n === 1) return "#8B5E00";
  if (n === 2) return "#9A3A00";
  if (n <= 4)  return "#8C1F00";
  return "#640808";
}

function sevHighlight(n: number): string {
  if (n === 0) return "rgba(180,180,200,0.25)";
  if (n === 1) return "#ECA010";
  if (n === 2) return "#D05800";
  if (n <= 4)  return "#C23000";
  return "#A01010";
}

// ── Tooltip ───────────────────────────────────────────────────────────────

interface TooltipState { cell: HoneycombCell; x: number; y: number }

function relTime(iso: string | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)}h ago`;
  return `${(ms / 86_400_000).toFixed(1)}d ago`;
}

const HexTooltip = ({ cell }: { cell: HoneycombCell }) => {
  const cats = cell.categories
    ? Object.entries(cell.categories).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div
      style={{
        background: "rgba(10,11,18,0.97)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 8,
        padding: "12px 14px",
        minWidth: 230,
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        pointerEvents: "none",
      }}
    >
      <div style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 14, color: "#fff", marginBottom: 3 }}>
        {cell.ci}
      </div>
      {cell.appName && (
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginBottom: 8, lineHeight: 1.4 }}>
          {cell.appName}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 5, columnGap: 12, fontSize: 11 }}>
        {cell.tier && (
          <>
            <span style={{ color: "rgba(255,255,255,0.4)" }}>Tier</span>
            <span style={{ color: "#fff" }}>{cell.tier}</span>
          </>
        )}
        {cell.director && (
          <>
            <span style={{ color: "rgba(255,255,255,0.4)" }}>Owner</span>
            <span style={{ color: "#fff" }}>{cell.director}</span>
          </>
        )}
        <span style={{ color: "rgba(255,255,255,0.4)" }}>Active</span>
        <span style={{ fontWeight: 700, color: cell.problemCount >= 5 ? "#ff7080" : cell.problemCount > 0 ? "#ECA010" : "rgba(255,255,255,0.4)" }}>
          {cell.problemCount} {cell.problemCount === 1 ? "problem" : "problems"}
        </span>
        {cats.length > 0 && (
          <>
            <span style={{ color: "rgba(255,255,255,0.4)" }}>Breakdown</span>
            <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {cats.map(([cat, cnt]) => (
                <span
                  key={cat}
                  style={{
                    background: `${CAT_COLORS[cat] ?? "#888"}22`,
                    color: CAT_COLORS[cat] ?? "#aaa",
                    border: `1px solid ${CAT_COLORS[cat] ?? "#888"}44`,
                    borderRadius: 4,
                    padding: "1px 5px",
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                >
                  {cnt} {catLabel(cat)}
                </span>
              ))}
            </span>
          </>
        )}
        {cell.revenueAtRisk > 0 && (
          <>
            <span style={{ color: "rgba(255,255,255,0.4)" }}>Rev. at Risk</span>
            <span style={{ color: "#ff7080", fontWeight: 700 }}>{formatUsd(cell.revenueAtRisk)}</span>
          </>
        )}
        {cell.oldestStart && (
          <>
            <span style={{ color: "rgba(255,255,255,0.4)" }}>Oldest</span>
            <span style={{ color: "rgba(255,255,255,0.7)" }}>{relTime(cell.oldestStart)}</span>
          </>
        )}
      </div>
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────

export const HoneycombChart = ({ cells, selectedCi, onSelect }: HoneycombChartProps) => {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { positions, svgW, svgH } = useMemo(() => {
    const n = cells.length;
    if (n === 0) return { positions: [] as { cx: number; cy: number; cell: HoneycombCell }[], svgW: 0, svgH: 0 };

    // cols based on aspect-ratio of flat-top step sizes
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * COL_STEP / ROW_STEP)));
    const rows = Math.ceil(n / cols);

    const w = cols * COL_STEP + HEX_W / 2 + PAD * 2;
    const h = rows * ROW_STEP + HEX_H / 2 + PAD * 2;

    const pos = cells.map((cell, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      // Odd columns offset downward by half row step
      const yOff = col % 2 === 1 ? ROW_STEP / 2 : 0;
      return {
        cx: PAD + col * COL_STEP + R,
        cy: PAD + row * ROW_STEP + HEX_H / 2 + yOff,
        cell,
      };
    });

    return { positions: pos, svgW: w, svgH: h };
  }, [cells]);

  const showTip = useCallback((cell: HoneycombCell, e: React.MouseEvent) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setTooltip({ cell, x: e.clientX, y: e.clientY });
  }, []);

  const moveTip = useCallback((cell: HoneycombCell, e: React.MouseEvent) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setTooltip({ cell, x: e.clientX, y: e.clientY });
  }, []);

  const hideTip = useCallback(() => {
    hideTimer.current = setTimeout(() => setTooltip(null), 80);
  }, []);

  const handleClick = useCallback((ci: string) => {
    onSelect?.(selectedCi === ci ? null : ci);
  }, [selectedCi, onSelect]);

  if (cells.length === 0) return null;

  // Safe viewport check
  const tooltipRight = tooltip ? tooltip.x + 260 > window.innerWidth : false;

  return (
    <>
      <div style={{ width: "100%", overflowX: "auto", overflowY: "hidden" }}>
        <svg
          width={svgW}
          height={svgH}
          style={{ display: "block", margin: "0 auto" }}
        >
          <defs>
            <filter id="hc-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {positions.map(({ cx, cy, cell }) => {
            const isSelected = selectedCi != null && selectedCi === cell.ci;
            const isDimmed = selectedCi != null && !isSelected;
            const n = cell.problemCount;
            const hasProblem = n > 0;
            const isCritical = n >= 5;
            const fill = sevFill(n);
            const highlight = sevHighlight(n);
            const stroke = isSelected ? "#fff" : hasProblem ? "rgba(255,255,255,0.15)" : "rgba(180,180,200,0.18)";
            const strokeW = isSelected ? 2.5 : 1;

            // Shortened CI label
            const ciShort = cell.ci.length > 8 ? cell.ci.slice(0, 7) + "…" : cell.ci;

            return (
              <g
                key={cell.ci}
                onClick={() => handleClick(cell.ci)}
                onMouseEnter={(e) => showTip(cell, e)}
                onMouseMove={(e) => moveTip(cell, e)}
                onMouseLeave={hideTip}
                style={{ cursor: "pointer" }}
                opacity={isDimmed ? 0.22 : 1}
                filter={isCritical && !isDimmed ? "url(#hc-glow)" : undefined}
              >
                {/* Shadow hex (slightly larger, darker) for depth */}
                {hasProblem && (
                  <polygon
                    points={hexPoints(cx, cy, R + 1)}
                    fill="rgba(0,0,0,0.35)"
                    stroke="none"
                  />
                )}
                {/* Main hex */}
                <polygon
                  points={hexPoints(cx, cy, R - 1)}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={strokeW}
                />
                {/* Inner highlight ring (top half glow) */}
                {hasProblem && (
                  <polygon
                    points={hexPoints(cx, cy, R - 3)}
                    fill="none"
                    stroke={highlight}
                    strokeWidth={1}
                    opacity={0.4}
                  />
                )}
                {hasProblem && (
                  <>
                    {/* Problem count — large center */}
                    <text
                      x={cx}
                      y={cy + (cell.revenueAtRisk > 0 ? -3 : 1)}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#fff"
                      fontSize={n >= 10 ? 13 : 16}
                      fontWeight={800}
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {n}
                    </text>
                    {/* CI label — small, below count */}
                    <text
                      x={cx}
                      y={cy + (n >= 10 ? 11 : 13)}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="rgba(255,255,255,0.7)"
                      fontSize={6.5}
                      fontWeight={600}
                      style={{ pointerEvents: "none", userSelect: "none", fontFamily: "monospace" }}
                    >
                      {ciShort}
                    </text>
                    {/* Revenue indicator dot */}
                    {cell.revenueAtRisk > 0 && (
                      <text
                        x={cx}
                        y={cy - 12}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="rgba(255,220,160,0.75)"
                        fontSize={8}
                        style={{ pointerEvents: "none", userSelect: "none" }}
                      >
                        $
                      </text>
                    )}
                  </>
                )}
                {/* Selected ring */}
                {isSelected && (
                  <polygon
                    points={hexPoints(cx, cy, R + 3)}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth={2}
                    opacity={0.7}
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {tooltip && createPortal(
        <div
          style={{
            position: "fixed",
            top: tooltip.y - 10,
            left: tooltipRight ? tooltip.x - 244 : tooltip.x + 14,
            transform: "translateY(-100%)",
            zIndex: 9999,
          }}
        >
          <HexTooltip cell={tooltip.cell} />
        </div>,
        document.body,
      )}
    </>
  );
};
