import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { DateTimePicker } from "@dynatrace/strato-components/forms";
import { Select } from "@dynatrace/strato-components/forms";
import { ToggleButtonGroup } from "@dynatrace/strato-components/forms";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { useCrosscheck, type ProblemScope } from "../context/CrosscheckContext";
import { CANONICAL_TIERS, type TechOpsRow } from "../lib/parseTechOpsCsv";

export interface ControlBarProps {
  onUploadRequest: () => void;
}

const WINDOW_OPTIONS = [2, 3, 14, 30, 60, 90, 120, 180] as const;

function uniqueSorted(values: ReadonlyArray<string>): string[] {
  const set = new Set<string>();
  for (const v of values) {
    if (v) set.add(v);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

// Extract a local YYYY-MM-DD string from whatever the DateTimePicker fires.
// Must use local date parts (getFullYear/Month/Date), NOT toISOString() which
// returns UTC — in UTC+ zones that would shift a "midnight local" value one day
// backward and create a countdown feedback loop with the controlled picker.
function dateValueToIso(value: unknown): string | null {
  if (!value) return null;

  let raw: string | null = null;
  if (typeof value === "string") {
    raw = value;
  } else if (typeof value === "object" && value !== null && "absoluteDate" in value) {
    const abs = (value as { absoluteDate?: unknown }).absoluteDate;
    if (typeof abs === "string") raw = abs;
  }
  if (!raw) return null;

  // Plain date string — no parsing needed
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // Full datetime — extract local calendar date to avoid UTC offset shift
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${dy}`;
}

export const ControlBar = ({
  onUploadRequest,
}: ControlBarProps) => {
  const {
    pivotIso,
    windowDays,
    setPivotIso,
    setWindowDays,
    appCiFilter,
    tierFilter,
    directorFilter,
    setAppCiFilter,
    setTierFilter,
    setDirectorFilter,
    applicationList,
    activeSource,
    problemScope,
    setProblemScope,
  } = useCrosscheck();

  const tierOptions = useMemo(
    () => uniqueSorted(applicationList.map((r) => r.Tier)),
    [applicationList],
  );
  const directorOptions = useMemo(
    () => uniqueSorted(applicationList.map((r) => r.Director)),
    [applicationList],
  );
  const appCiOptions = useMemo(() => {
    const tierSet = new Set(tierFilter);
    const dirSet = new Set(directorFilter);
    const filtered = applicationList.filter((r) => {
      if (tierSet.size > 0 && !tierSet.has(r.Tier)) return false;
      if (dirSet.size > 0 && !dirSet.has(r.Director)) return false;
      return true;
    });
    return uniqueSorted(filtered.map((r) => r.AppCI.toLowerCase())).map(
      (lower) => ({ value: lower, label: lower.toUpperCase() }),
    );
  }, [applicationList, tierFilter, directorFilter]);

  const handleDateChange = (value: unknown) => {
    const iso = dateValueToIso(value);
    if (iso) setPivotIso(iso);
  };

  const handleWindowChange = (value: string) => {
    const n = Number(value);
    if (Number.isFinite(n) && (WINDOW_OPTIONS as readonly number[]).includes(n)) {
      setWindowDays(n);
    }
  };

  return (
    <Flex
      gap={16}
      alignItems="flex-end"
      flexFlow="wrap"
      style={{
        padding: "14px 20px",
        background: Colors.Background.Surface.Default,
      }}
    >
      <LabeledControl label="Pivot date">
        <DateTimePicker
          type="date"
          value={pivotIso}
          onChange={handleDateChange}
        />
      </LabeledControl>

      <LabeledControl label="Window (days)">
        <ToggleButtonGroup value={String(windowDays)} onChange={handleWindowChange}>
          {WINDOW_OPTIONS.map((n) => (
            <ToggleButtonGroup.Item key={n} value={String(n)}>
              {n}
            </ToggleButtonGroup.Item>
          ))}
        </ToggleButtonGroup>
      </LabeledControl>

      <LabeledControl label="Problem type">
        <ToggleButtonGroup
          value={problemScope}
          onChange={(v) => setProblemScope(v as ProblemScope)}
        >
          <ToggleButtonGroup.Item value="business">Business impacting</ToggleButtonGroup.Item>
          <ToggleButtonGroup.Item value="operational">Operational</ToggleButtonGroup.Item>
          <ToggleButtonGroup.Item value="all">All</ToggleButtonGroup.Item>
        </ToggleButtonGroup>
      </LabeledControl>

      <LabeledControl label="Tier">
        <Select
          multiple
          value={Array.from(tierFilter)}
          onChange={(v) => setTierFilter(Array.isArray(v) ? v : [])}
          clearable
          disabled={tierOptions.length === 0}
        >
          <Select.Trigger placeholder="All tiers" />
          <Select.Content>
            {(tierOptions.length > 0
              ? tierOptions
              : (CANONICAL_TIERS as readonly string[])
            ).map((t: string) => (
              <Select.Option key={t} value={t}>
                {t}
              </Select.Option>
            ))}
          </Select.Content>
        </Select>
      </LabeledControl>

      <LabeledControl label="Director">
        <Select
          multiple
          value={Array.from(directorFilter)}
          onChange={(v) => setDirectorFilter(Array.isArray(v) ? v : [])}
          clearable
          disabled={directorOptions.length === 0}
        >
          <Select.Trigger placeholder="All directors" />
          <Select.Content>
            {directorOptions.map((d) => (
              <Select.Option key={d} value={d}>
                {d}
              </Select.Option>
            ))}
          </Select.Content>
        </Select>
      </LabeledControl>

      <LabeledControl label="ApplicationCI">
        <Select
          multiple
          value={Array.from(appCiFilter)}
          onChange={(v) => setAppCiFilter(Array.isArray(v) ? v : [])}
          clearable
          disabled={appCiOptions.length === 0}
        >
          <Select.Trigger placeholder="All CIs" />
          <Select.Content>
            <Select.Filter />
            {appCiOptions.map((opt) => (
              <Select.Option key={opt.value} value={opt.value}>
                {opt.label}
              </Select.Option>
            ))}
          </Select.Content>
        </Select>
      </LabeledControl>

      <Flex gap={8} alignItems="center">
        <Button onClick={onUploadRequest} variant="default">
          Upload table
        </Button>
        <CiCountBadge applicationList={applicationList} activeSource={activeSource} />
      </Flex>
    </Flex>
  );
};

const LabeledControl = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <Flex flexDirection="column" gap={4}>
    <Text textStyle="small-emphasized">{label}</Text>
    {children}
  </Flex>
);

const TIER_COLORS: Record<string, string> = {
  "1 – most critical":     "#C82D40",
  "2 – somewhat critical": "#D98E00",
  "3 – less critical":     "#1C5BE5",
  "4 – not critical":      "#56A012",
};

const CiCountBadge = ({
  applicationList,
  activeSource,
}: {
  applicationList: readonly TechOpsRow[];
  activeSource: string | null;
}) => {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => () => clearTimeout(hideTimerRef.current), []);

  const sorted = useMemo(
    () => [...applicationList].sort((a, b) => a.AppCI.localeCompare(b.AppCI)),
    [applicationList],
  );

  const handleTriggerEnter = () => {
    clearTimeout(hideTimerRef.current);
    if (sorted.length === 0) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltipPos({
      x: Math.max(8, Math.min(rect.left, window.innerWidth - 560)),
      y: rect.bottom + 6,
    });
  };

  const handleLeave = () => {
    hideTimerRef.current = setTimeout(() => setTooltipPos(null), 120);
  };

  const handleTooltipEnter = () => clearTimeout(hideTimerRef.current);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleTriggerEnter}
        onMouseLeave={handleLeave}
        style={{
          cursor: sorted.length > 0 ? "help" : "default",
          textDecoration: sorted.length > 0 ? "underline dotted rgba(128,128,128,0.5)" : "none",
          textUnderlineOffset: 3,
        }}
      >
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default }}>
          {applicationList.length} CIs · source: {activeSource ?? "none"}
        </Text>
      </span>

      {tooltipPos !== null &&
        typeof document !== "undefined" &&
        sorted.length > 0 &&
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
              minWidth: 620,
              maxWidth: 780,
              maxHeight: 420,
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
                display: "grid",
                gridTemplateColumns: "130px 1fr 140px 150px",
                columnGap: 10,
              }}
            >
              <Text textStyle="small-emphasized" style={{ opacity: 0.5, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                AppCI · {sorted.length}
              </Text>
              <Text textStyle="small-emphasized" style={{ opacity: 0.5, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                App Name
              </Text>
              <Text textStyle="small-emphasized" style={{ opacity: 0.5, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Tier
              </Text>
              <Text textStyle="small-emphasized" style={{ opacity: 0.5, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Owner
              </Text>
            </div>
            <div style={{ padding: "4px 0" }}>
              {sorted.map((row) => {
                const tierColor = TIER_COLORS[row.Tier] ?? Colors.Text.Neutral.Default;
                return (
                  <div
                    key={row.AppCI}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "130px 1fr 140px 150px",
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
                      {row.AppCI}
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
                      {row.ApplicationName || "—"}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: tierColor,
                        fontWeight: 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.Tier}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: Colors.Text.Neutral.Default,
                        opacity: 0.65,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.Director || "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};
