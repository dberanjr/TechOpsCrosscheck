import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import {
  classify,
  DEFAULT_CLIP,
} from "../lib/percentChange";
import {
  improvementGreen,
  regressionRed,
  pivotLineColor,
} from "../lib/colors";

export interface DivergingBarProps {
  value: number | null | undefined;
  clipAt?: number;
  width?: number | string;
  height?: number;
}

export const DivergingBar = ({
  value,
  clipAt = DEFAULT_CLIP,
  width = 120,
  height = 12,
}: DivergingBarProps) => {
  const result = classify(value, clipAt);

  if (result.display === null) {
    return (
      <Text textStyle="small" style={{ color: pivotLineColor }}>
        —
      </Text>
    );
  }

  const isNegative = result.display < 0;
  const fillPct = (Math.abs(result.display) / clipAt) * 50;
  const fillColor = isNegative ? improvementGreen : regressionRed;

  return (
    <Flex
      style={{
        position: "relative",
        width,
        height,
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          bottom: 0,
          width: 1,
          background: pivotLineColor,
          opacity: 0.5,
        }}
      />
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 1,
          bottom: 1,
          background: fillColor,
          borderRadius: 2,
          ...(isNegative
            ? { right: "50%", width: `${fillPct}%` }
            : { left: "50%", width: `${fillPct}%` }),
        }}
      />
      {result.clipped && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            ...(isNegative ? { left: 0 } : { right: 0 }),
            color: fillColor,
            fontSize: height,
            lineHeight: `${height}px`,
            fontWeight: 700,
            pointerEvents: "none",
          }}
        >
          {isNegative ? "‹" : "›"}
        </span>
      )}
    </Flex>
  );
};
