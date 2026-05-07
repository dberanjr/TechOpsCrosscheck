import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import Borders from "@dynatrace/strato-design-tokens/borders";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { ArrowSmallUpIcon, ArrowSmallDownIcon } from "@dynatrace/strato-icons";
import { LoadingOverlay } from "./LoadingOverlay";
import { classify, NEW_EMERGENCE_SENTINEL } from "../lib/percentChange";
import { formatPercent } from "../lib/formatters";
import {
  improvementGreen,
  regressionRed,
  pivotLineColor,
  preBlue,
  preFillRgba,
} from "../lib/colors";

export interface CiListItem {
  appCi: string;
  appName: string;
}

export interface TierCardProps {
  tier: string;
  ciCount: number;
  mttrPct: number | null | undefined;
  countPct: number | null | undefined;
  impactPct: number | null | undefined;
  preMttr?: number | null;
  postMttr?: number | null;
  preCount?: number;
  postCount?: number;
  preImpact?: number;
  postImpact?: number;
  isLoading?: boolean;
  isInactive?: boolean;
  ciList?: readonly CiListItem[];
  onClick?: () => void;
}

function parseTier(tier: string): { num: string; label: string } {
  const m = tier.match(/^(\d+)\s*[–\-]\s*(.+)$/);
  return m ? { num: m[1], label: m[2].trim() } : { num: tier, label: "" };
}

function tierGradient(num: string): { from: string; to: string } {
  switch (num) {
    case "1": return { from: "#7A1525", to: "#C82D40" };
    case "2": return { from: "#A06500", to: "#D98E00" };
    case "3": return { from: "#0C3D8F", to: "#1C5BE5" };
    case "4": return { from: "#2E6610", to: "#56A012" };
    default:  return { from: "#333", to: "#555" };
  }
}

/** Before/after micro-sparkline: flat blue pre level → colored diagonal to post level. */
const TrendSparkline = ({
  pre,
  post,
  lowerIsBetter = true,
  height = 22,
}: {
  pre: number | null | undefined;
  post: number | null | undefined;
  lowerIsBetter?: boolean;
  height?: number;
}) => {
  if (pre == null || post == null) {
    return <div style={{ height, width: "100%" }} />;
  }

  const improved = lowerIsBetter ? post < pre : post > pre;
  const noChange = Math.abs((post - pre) / (pre || 1)) < 0.005;
  const postStroke = noChange ? pivotLineColor : improved ? improvementGreen : regressionRed;
  const postFill = noChange
    ? "rgba(128,128,128,0.08)"
    : improved
    ? "rgba(115,190,40,0.15)"
    : "rgba(200,45,64,0.15)";

  const W = 100;
  const midX = W / 2;
  const min = Math.min(pre, post);
  const max = Math.max(pre, post);
  const range = max - min || 1;
  const pad = 2;
  const preY = pad + ((max - pre) / range) * (height - pad * 2);
  const postY = pad + ((max - post) / range) * (height - pad * 2);
  const baseY = height + 1;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      style={{ display: "block" }}
    >
      {/* Pre area fill */}
      <path d={`M0,${baseY} L0,${preY} L${midX},${preY} L${midX},${baseY} Z`} fill={preFillRgba} />
      {/* Post area fill (diagonal) */}
      <path d={`M${midX},${baseY} L${midX},${preY} L${W},${postY} L${W},${baseY} Z`} fill={postFill} />
      {/* Pre line (flat, blue) */}
      <line x1={0} y1={preY} x2={midX} y2={preY} stroke={preBlue} strokeWidth={1.5} strokeLinecap="round" />
      {/* Post line (diagonal, sentiment-colored) */}
      <line x1={midX} y1={preY} x2={W} y2={postY} stroke={postStroke} strokeWidth={1.5} strokeLinecap="round" />
      {/* Pivot dashed line */}
      <line
        x1={midX} y1={0} x2={midX} y2={height}
        stroke={pivotLineColor}
        strokeWidth={1}
        strokeDasharray="2 2"
        opacity={0.5}
      />
    </svg>
  );
};

const StatPanel = ({
  label,
  value,
  pre,
  post,
}: {
  label: string;
  value: number | null | undefined;
  pre: number | null | undefined;
  post: number | null | undefined;
}) => {
  const result = classify(value);
  const display = value === NEW_EMERGENCE_SENTINEL ? "∞" : formatPercent(result.value);
  const isNeg = result.value !== null && result.value < -0.01;
  const isPos = result.value !== null && result.value > 0.01;
  const color = isNeg ? improvementGreen : isPos ? regressionRed : pivotLineColor;
  const Icon = isPos ? ArrowSmallUpIcon : isNeg ? ArrowSmallDownIcon : null;

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        padding: "8px 2px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        overflow: "visible",
        boxSizing: "border-box",
      }}
    >
      <span
        style={{
          color: Colors.Text.Neutral.Default,
          textTransform: "uppercase",
          fontSize: 10,
          letterSpacing: "0.07em",
          textAlign: "center",
          opacity: 0.65,
          whiteSpace: "nowrap",
          display: "block",
        }}
      >
        {label}
      </span>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          minHeight: 22,
          overflow: "visible",
          whiteSpace: "nowrap",
        }}
      >
        {Icon && <Icon size="small" style={{ color, flexShrink: 0 }} />}
        <span style={{ color, fontSize: 13, fontWeight: 700, lineHeight: 1, whiteSpace: "nowrap" }}>
          {display}
        </span>
      </div>
      <div style={{ width: "100%", paddingBottom: 2 }}>
        <TrendSparkline pre={pre} post={post} height={22} />
      </div>
    </div>
  );
};

export const TierCard = ({
  tier,
  ciCount,
  mttrPct,
  countPct,
  impactPct,
  preMttr,
  postMttr,
  preCount,
  postCount,
  preImpact,
  postImpact,
  isLoading = false,
  isInactive = false,
  ciList = [],
  onClick,
}: TierCardProps) => {
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [hovered, setHovered] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(hideTimerRef.current), []);

  const handleTriggerEnter = () => {
    clearTimeout(hideTimerRef.current);
    if (ciList.length === 0) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltipPos({
      x: Math.max(8, Math.min(rect.left, window.innerWidth - 480)),
      y: rect.bottom + 6,
    });
  };
  const handleLeave = () => {
    hideTimerRef.current = setTimeout(() => setTooltipPos(null), 120);
  };
  const handleTooltipEnter = () => clearTimeout(hideTimerRef.current);

  const { num, label } = parseTier(tier);
  const { from, to } = tierGradient(num);

  return (
    <Surface
      as={onClick ? "button" : "div"}
      onClick={onClick}
      aria-label={`${tier} tier rollup`}
      onMouseEnter={() => onClick && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        borderRadius: Borders.Radius.Container.Default,
        background: Colors.Background.Surface.Default,
        cursor: onClick ? "pointer" : "default",
        textAlign: "left",
        border: "none",
        width: "100%",
        opacity: isInactive ? 0.3 : 1,
        transition: "opacity 0.2s ease, box-shadow 0.15s ease, transform 0.15s ease",
        boxShadow: hovered && onClick ? "0 4px 16px rgba(0,0,0,0.18)" : undefined,
        transform: hovered && onClick ? "translateY(-1px)" : undefined,
      }}
    >
      {isLoading && <LoadingOverlay />}

      {/* Gradient header */}
      <div
        style={{
          background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
          padding: "14px 16px 12px",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 52,
              fontWeight: 900,
              color: "#fff",
              lineHeight: 1,
              letterSpacing: "-3px",
            }}
          >
            {num}
          </div>
          {label && (
            <div
              style={{
                color: "rgba(255,255,255,0.72)",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.65px",
                marginTop: 4,
                lineHeight: 1,
              }}
            >
              {label}
            </div>
          )}
        </div>
        <span
          ref={triggerRef}
          onMouseEnter={handleTriggerEnter}
          onMouseLeave={handleLeave}
          style={{
            marginTop: 6,
            cursor: ciList.length > 0 ? "help" : "default",
            textDecoration: ciList.length > 0 ? "underline dotted rgba(255,255,255,0.5)" : "none",
            textUnderlineOffset: 3,
          }}
        >
          <Text
            textStyle="small-emphasized"
            style={{ color: "rgba(255,255,255,0.82)", fontSize: 11 }}
          >
            {ciCount} CIs
          </Text>
        </span>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "rgba(128,128,128,0.12)" }} />

      {/* Stats: MTTR · Count · Impact */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1px 1fr 1px 1fr",
          alignItems: "stretch",
          flex: 1,
        }}
      >
        <StatPanel label="MTTR" value={mttrPct} pre={preMttr} post={postMttr} />
        <div style={{ background: "rgba(128,128,128,0.12)" }} />
        <StatPanel label="Count" value={countPct} pre={preCount} post={postCount} />
        <div style={{ background: "rgba(128,128,128,0.12)" }} />
        <StatPanel label="Impact" value={impactPct} pre={preImpact} post={postImpact} />
      </div>

      {tooltipPos !== null &&
        typeof document !== "undefined" &&
        ciList.length > 0 &&
        createPortal(
          <div
            onMouseEnter={handleTooltipEnter}
            onMouseLeave={handleLeave}
            style={{
              position: "fixed",
              top: tooltipPos.y,
              left: tooltipPos.x,
              zIndex: 99999,
              background: Colors.Background.Surface.Default,
              border: "1px solid rgba(128,128,128,0.22)",
              borderRadius: 6,
              boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
              minWidth: 360,
              maxWidth: 500,
              maxHeight: 360,
              overflowY: "auto",
            }}
          >
            <div
              style={{
                padding: "8px 14px",
                borderBottom: "1px solid rgba(128,128,128,0.15)",
                position: "sticky",
                top: 0,
                background: Colors.Background.Surface.Default,
                zIndex: 1,
              }}
            >
              <Text textStyle="small-emphasized">
                {tier} · {ciList.length} CIs
              </Text>
            </div>
            <div style={{ padding: "4px 0" }}>
              {ciList.map(({ appCi, appName }) => (
                <div
                  key={appCi}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "160px 1fr",
                    columnGap: 10,
                    padding: "3px 14px",
                    alignItems: "baseline",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.02em",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {appCi}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: Colors.Text.Neutral.Default,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {appName || "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </Surface>
  );
};
