import React, { useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import {
  ArrowSmallRightIcon,
  ArrowSmallUpIcon,
  ArrowSmallDownIcon,
} from "@dynatrace/strato-icons";
import Borders from "@dynatrace/strato-design-tokens/borders";
import Colors from "@dynatrace/strato-design-tokens/colors";
import Spacings from "@dynatrace/strato-design-tokens/spacings";
import { Sparkline } from "./Sparkline";
import { LoadingOverlay } from "./LoadingOverlay";
import { pctChange, classify, NEW_EMERGENCE_SENTINEL } from "../lib/percentChange";
import { formatPercent } from "../lib/formatters";
import { improvementGreen, regressionRed, pivotLineColor } from "../lib/colors";

export interface MetricCardProps {
  label: string;
  pre: number | null | undefined;
  post: number | null | undefined;
  format: (value: number | null | undefined) => string;
  /** Lower-is-better metrics flip the green/red sense. Default true (regression = post > pre). */
  lowerIsBetter?: boolean;
  sparklineValues?: ReadonlyArray<number | null | undefined>;
  pivotIndex?: number;
  isLoading?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
  preStartLabel?: string;
  pivotLabel?: string;
  postEndLabel?: string;
}

export const MetricCard = ({
  label,
  pre,
  post,
  format,
  lowerIsBetter = true,
  sparklineValues,
  pivotIndex = 0,
  isLoading = false,
  onClick,
  ariaLabel,
  preStartLabel,
  pivotLabel,
  postEndLabel,
}: MetricCardProps) => {
  const raw = pctChange(pre, post);
  const result = classify(raw);
  const isNew = raw === NEW_EMERGENCE_SENTINEL;
  const isImprovement =
    result.value !== null && !isNew
      ? lowerIsBetter
        ? result.value < 0
        : result.value > 0
      : false;
  const isRegression =
    result.value !== null && !isNew
      ? lowerIsBetter
        ? result.value > 0
        : result.value < 0
      : isNew;

  const pctColor = isImprovement
    ? improvementGreen
    : isRegression
      ? regressionRed
      : pivotLineColor;

  const TrendIcon =
    result.value === null
      ? null
      : (lowerIsBetter ? result.value > 0 : result.value < 0)
        ? ArrowSmallUpIcon
        : ArrowSmallDownIcon;

  const pctLabel = isNew ? "∞" : formatPercent(result.value);
  const [hovered, setHovered] = useState(false);

  return (
    <Surface
      as={onClick ? "button" : "div"}
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      onMouseEnter={() => onClick && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: Spacings.Size8,
        padding: Spacings.Size16,
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
        {label}
      </Text>
      <Flex alignItems="center" gap={8} style={{ flexWrap: "wrap" }}>
        <Heading level={3} style={{ margin: 0 }}>
          {format(pre)}
        </Heading>
        <ArrowSmallRightIcon size="small" style={{ flexShrink: 0 }} />
        <Heading level={3} style={{ margin: 0 }}>
          {format(post)}
        </Heading>
      </Flex>
      <Flex alignItems="center" gap={6}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 18,
            fontWeight: 800,
            color: pctColor,
            background: isImprovement
              ? "rgba(115,190,40,0.12)"
              : isRegression
                ? "rgba(200,45,64,0.12)"
                : "rgba(128,128,128,0.08)",
            padding: "3px 10px",
            borderRadius: 6,
            letterSpacing: "-0.3px",
            lineHeight: 1.2,
          }}
        >
          {TrendIcon && <TrendIcon size="small" />}
          {pctLabel}
        </span>
      </Flex>
      {sparklineValues && sparklineValues.length > 1 && (
        <div style={{ width: "100%" }}>
          <Sparkline
            values={sparklineValues}
            pivotIndex={pivotIndex}
            width={220}
            height={36}
            ariaLabel={`${label} daily trend`}
            format={(v) => format(v)}
          />
          {(preStartLabel || pivotLabel || postEndLabel) && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                marginTop: 2,
              }}
            >
              <span style={{ fontSize: 9, color: "#1C5BE5", opacity: 0.8, lineHeight: 1 }}>
                {preStartLabel}
              </span>
              <span
                style={{
                  fontSize: 9,
                  color: "#888888",
                  opacity: 0.9,
                  lineHeight: 1,
                  textAlign: "center",
                  fontWeight: 600,
                }}
              >
                {pivotLabel}
              </span>
              <span
                style={{
                  fontSize: 9,
                  color: "#C82D40",
                  opacity: 0.8,
                  lineHeight: 1,
                  textAlign: "right",
                }}
              >
                {postEndLabel}
              </span>
            </div>
          )}
        </div>
      )}
    </Surface>
  );
};
