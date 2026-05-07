import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { preBlue, postRed } from "../lib/colors";

export interface TwinBarProps {
  pre: number | null | undefined;
  post: number | null | undefined;
  format: (value: number | null | undefined) => string;
  width?: number | string;
  barHeight?: number;
}

function clean(n: number | null | undefined): number {
  if (n === null || n === undefined || Number.isNaN(n)) return 0;
  return n;
}

export const TwinBar = ({
  pre,
  post,
  format,
  width = 140,
  barHeight = 8,
}: TwinBarProps) => {
  const preVal = clean(pre);
  const postVal = clean(post);
  const max = Math.max(Math.abs(preVal), Math.abs(postVal), 1);
  const prePct = (Math.abs(preVal) / max) * 100;
  const postPct = (Math.abs(postVal) / max) * 100;

  return (
    <Flex flexDirection="column" gap={2} style={{ width }}>
      <Flex alignItems="center" gap={6}>
        <span
          aria-hidden
          style={{
            flex: "1 1 auto",
            position: "relative",
            height: barHeight,
            background: Colors.Background.Surface.Default,
          }}
        >
          <span
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: `${prePct}%`,
              background: preBlue,
              borderRadius: 1,
            }}
          />
        </span>
        <Text textStyle="small" style={{ minWidth: 56, textAlign: "right" }}>
          {format(pre)}
        </Text>
      </Flex>
      <Flex alignItems="center" gap={6}>
        <span
          aria-hidden
          style={{
            flex: "1 1 auto",
            position: "relative",
            height: barHeight,
            background: Colors.Background.Surface.Default,
          }}
        >
          <span
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: `${postPct}%`,
              background: postRed,
              borderRadius: 1,
            }}
          />
        </span>
        <Text textStyle="small" style={{ minWidth: 56, textAlign: "right" }}>
          {format(post)}
        </Text>
      </Flex>
    </Flex>
  );
};
