import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  preBlue,
  postRed,
  preFillRgba,
  postFillRgba,
  pivotLineColor,
} from "../lib/colors";

export interface SparklineProps {
  values: ReadonlyArray<number | null | undefined>;
  pivotIndex: number;
  width?: number;
  height?: number;
  ariaLabel?: string;
  format?: (v: number) => string;
}

interface Point {
  x: number;
  y: number;
}

function buildSegments(points: ReadonlyArray<Point | null>): Point[][] {
  const segments: Point[][] = [];
  let current: Point[] = [];
  for (const p of points) {
    if (p === null) {
      if (current.length > 0) { segments.push(current); current = []; }
      continue;
    }
    current.push(p);
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

function lineD(segment: ReadonlyArray<Point>): string {
  return segment
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
}

function fillD(segment: ReadonlyArray<Point>, baselineY: number): string {
  if (segment.length === 0) return "";
  const first = segment[0];
  const last = segment[segment.length - 1];
  return [
    `M${first.x.toFixed(2)},${baselineY.toFixed(2)}`,
    ...segment.map((p) => `L${p.x.toFixed(2)},${p.y.toFixed(2)}`),
    `L${last.x.toFixed(2)},${baselineY.toFixed(2)}`,
    "Z",
  ].join(" ");
}

export const Sparkline = ({
  values,
  pivotIndex,
  width = 200,
  height = 40,
  ariaLabel,
  format,
}: SparklineProps) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const valid = values.filter(
    (v): v is number => v !== null && v !== undefined && !Number.isNaN(v),
  );
  if (valid.length < 2 || values.length < 2) {
    return (
      <svg
        role="img"
        aria-label={ariaLabel ?? "no sparkline data"}
        width="100%"
        height={height}
      />
    );
  }

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const xStep = width / (values.length - 1);
  const baselineY = height - 1;

  const points: (Point | null)[] = values.map((v, i) =>
    v === null || v === undefined || Number.isNaN(v)
      ? null
      : { x: i * xStep, y: 1 + ((max - v) / range) * (height - 2) },
  );

  const safePivot = Math.max(0, Math.min(values.length - 1, pivotIndex));
  const prePoints = points.slice(0, safePivot + 1);
  const postPoints = points.slice(safePivot);
  const preSegments = buildSegments(prePoints);
  const postSegments = buildSegments(postPoints);
  const pivotX = safePivot * xStep;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const idx = Math.round(relX * (values.length - 1));
    const clamped = Math.max(0, Math.min(values.length - 1, idx));
    setHoveredIdx(clamped);
    setTooltipPos({ x: e.clientX, y: rect.top - 6 });
  };

  const handleMouseLeave = () => {
    setHoveredIdx(null);
    setTooltipPos(null);
  };

  const hoveredPoint = hoveredIdx !== null ? points[hoveredIdx] : null;
  const hoveredValue = hoveredIdx !== null ? values[hoveredIdx] : null;
  const hoveredX = hoveredIdx !== null ? hoveredIdx * xStep : null;
  const isPost = hoveredIdx !== null && hoveredIdx > safePivot;
  const dotColor = isPost ? postRed : preBlue;

  const tooltipText =
    hoveredValue !== null && hoveredValue !== undefined && !Number.isNaN(hoveredValue)
      ? format
        ? format(hoveredValue)
        : String(hoveredValue)
      : "—";

  return (
    <>
      <svg
        ref={svgRef}
        role="img"
        aria-label={ariaLabel ?? "sparkline"}
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ cursor: "crosshair" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {preSegments.map((seg, i) => (
          <path key={`pre-fill-${i}`} d={fillD(seg, baselineY)} fill={preFillRgba} />
        ))}
        {postSegments.map((seg, i) => (
          <path key={`post-fill-${i}`} d={fillD(seg, baselineY)} fill={postFillRgba} />
        ))}
        {preSegments.map((seg, i) => (
          <path
            key={`pre-line-${i}`}
            d={lineD(seg)}
            stroke={preBlue}
            strokeWidth={1.5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {postSegments.map((seg, i) => (
          <path
            key={`post-line-${i}`}
            d={lineD(seg)}
            stroke={postRed}
            strokeWidth={1.5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        <line
          x1={pivotX}
          y1={0}
          x2={pivotX}
          y2={height}
          stroke={pivotLineColor}
          strokeWidth={1}
          strokeDasharray="3 2"
          opacity={0.7}
        />
        {hoveredX !== null && (
          <line
            x1={hoveredX}
            y1={0}
            x2={hoveredX}
            y2={height}
            stroke={dotColor}
            strokeWidth={1}
            opacity={0.4}
          />
        )}
        {hoveredPoint && (
          <circle
            cx={hoveredPoint.x}
            cy={hoveredPoint.y}
            r={2.5}
            fill={dotColor}
            stroke="#fff"
            strokeWidth={1}
          />
        )}
      </svg>

      {tooltipPos && hoveredValue !== null && hoveredValue !== undefined && !Number.isNaN(hoveredValue) &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: tooltipPos.y,
              left: tooltipPos.x,
              transform: "translate(-50%, -100%)",
              pointerEvents: "none",
              zIndex: 99999,
              background: "rgba(20,20,30,0.88)",
              color: "#fff",
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 8px",
              borderRadius: 4,
              whiteSpace: "nowrap",
              boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
            }}
          >
            <span style={{ color: isPost ? "#f07080" : "#7ab0f0", fontSize: 9, fontWeight: 500, marginRight: 4 }}>
              {isPost ? "Post" : "Pre"}
            </span>
            {tooltipText}
          </div>,
          document.body,
        )}
    </>
  );
};
