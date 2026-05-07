import React, { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatUsd } from "../lib/formatters";

export interface HoneycombCell {
  ci: string;
  appName?: string;
  tier?: string;
  problemCount: number;
  revenueAtRisk: number;
}

interface HoneycombChartProps {
  cells: HoneycombCell[];
  selectedCi?: string | null;
  onSelect?: (ci: string | null) => void;
}

const R = 22;
const SQRT3 = Math.sqrt(3);
const COL_W = SQRT3 * R;
const ROW_H = 1.5 * R;
const PAD = R + 6;

function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

function severityColor(count: number): { fill: string; stroke: string; strokeW: number } {
  if (count === 0) return { fill: "rgba(128,128,128,0.07)", stroke: "rgba(128,128,128,0.22)", strokeW: 0.8 };
  if (count === 1) return { fill: "#FEAA2F", stroke: "rgba(0,0,0,0.18)", strokeW: 1 };
  if (count === 2) return { fill: "#ED6910", stroke: "rgba(0,0,0,0.18)", strokeW: 1 };
  if (count <= 4) return { fill: "#D94030", stroke: "rgba(0,0,0,0.18)", strokeW: 1 };
  return { fill: "#9A1E2C", stroke: "#fff", strokeW: 1.5 };
}

interface TooltipState {
  cell: HoneycombCell;
  x: number;
  y: number;
}

export const HoneycombChart = ({ cells, selectedCi, onSelect }: HoneycombChartProps) => {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { positions, svgW, svgH } = useMemo(() => {
    const n = cells.length;
    if (n === 0) return { positions: [] as { cx: number; cy: number; cell: HoneycombCell }[], svgW: 0, svgH: 0 };
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * COL_W / ROW_H)));
    const rows = Math.ceil(n / cols);
    const w = cols * COL_W + COL_W / 2 + PAD * 2;
    const h = rows * ROW_H + R / 2 + PAD * 2;
    const pos = cells.map((cell, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const yOff = col % 2 === 1 ? ROW_H / 2 : 0;
      return {
        cx: PAD + col * COL_W + COL_W / 2,
        cy: PAD + row * ROW_H + R + yOff,
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
    setTooltip((prev) => prev && prev.cell.ci === cell.ci ? { cell, x: e.clientX, y: e.clientY } : prev);
  }, []);

  const hideTip = useCallback(() => {
    hideTimer.current = setTimeout(() => setTooltip(null), 60);
  }, []);

  const handleClick = useCallback((ci: string) => {
    onSelect?.(selectedCi === ci ? null : ci);
  }, [selectedCi, onSelect]);

  if (cells.length === 0) return null;

  return (
    <>
      <div style={{ width: "100%", overflowX: "auto", overflowY: "hidden" }}>
        <svg
          width={svgW}
          height={svgH}
          style={{ display: "block", margin: "0 auto" }}
        >
          {positions.map(({ cx, cy, cell }) => {
            const isSelected = selectedCi != null && selectedCi === cell.ci;
            const isDimmed = selectedCi != null && !isSelected;
            const { fill, stroke, strokeW } = severityColor(cell.problemCount);
            const label = cell.ci.length > 9 ? cell.ci.slice(0, 8) + "…" : cell.ci;
            return (
              <g
                key={cell.ci}
                onClick={() => handleClick(cell.ci)}
                onMouseEnter={(e) => showTip(cell, e)}
                onMouseMove={(e) => moveTip(cell, e)}
                onMouseLeave={hideTip}
                style={{ cursor: "pointer" }}
                opacity={isDimmed ? 0.28 : 1}
              >
                <polygon
                  points={hexPoints(cx, cy, R - 1.5)}
                  fill={fill}
                  stroke={isSelected ? "#ffffff" : stroke}
                  strokeWidth={isSelected ? 2.5 : strokeW}
                />
                {cell.problemCount > 0 && (
                  <>
                    <text
                      x={cx}
                      y={cy - 4}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#fff"
                      fontSize={6.5}
                      fontWeight={500}
                      style={{ pointerEvents: "none", userSelect: "none", fontFamily: "monospace" }}
                      opacity={0.85}
                    >
                      {label}
                    </text>
                    <text
                      x={cx}
                      y={cy + 7}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#fff"
                      fontSize={11}
                      fontWeight={700}
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {cell.problemCount}
                    </text>
                  </>
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
            left: tooltip.x + 14,
            transform: "translateY(-100%)",
            background: "rgba(18, 20, 28, 0.97)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            padding: "10px 14px",
            zIndex: 9999,
            pointerEvents: "none",
            minWidth: 200,
            boxShadow: "0 6px 24px rgba(0,0,0,0.55)",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 13, color: "#fff", marginBottom: 2, fontFamily: "monospace" }}>
            {tooltip.cell.ci}
          </div>
          {tooltip.cell.appName && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginBottom: 8 }}>
              {tooltip.cell.appName}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 4, columnGap: 12, fontSize: 11 }}>
            {tooltip.cell.tier && (
              <>
                <span style={{ color: "rgba(255,255,255,0.45)" }}>Tier</span>
                <span style={{ color: "#fff" }}>{tooltip.cell.tier}</span>
              </>
            )}
            <span style={{ color: "rgba(255,255,255,0.45)" }}>Active Problems</span>
            <span style={{
              fontWeight: 700,
              color: tooltip.cell.problemCount >= 5 ? "#ff6b7a" : tooltip.cell.problemCount > 0 ? "#FEAA2F" : "rgba(255,255,255,0.4)",
            }}>
              {tooltip.cell.problemCount}
            </span>
            <span style={{ color: "rgba(255,255,255,0.45)" }}>Rev. at Risk</span>
            <span style={{ color: tooltip.cell.revenueAtRisk > 0 ? "#ff6b7a" : "rgba(255,255,255,0.4)" }}>
              {tooltip.cell.revenueAtRisk > 0 ? formatUsd(tooltip.cell.revenueAtRisk) : "—"}
            </span>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};
