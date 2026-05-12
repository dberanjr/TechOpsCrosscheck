import React, { useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Chip } from "@dynatrace/strato-components/content";
import { ToggleButtonGroup } from "@dynatrace/strato-components/forms";
import { DataTable } from "@dynatrace/strato-components/tables";
import Colors from "@dynatrace/strato-design-tokens/colors";
import type { DataTableColumnDef } from "@dynatrace/strato-components/tables";
import { DivergingBar } from "./DivergingBar";
import { PermissionRequired } from "./PermissionRequired";
import { useCrosscheck, type VerdictFilter } from "../context/CrosscheckContext";
import { classify, NEW_EMERGENCE_SENTINEL } from "../lib/percentChange";
import { formatPercent, formatMttr, formatNumber } from "../lib/formatters";
import { improvementGreen, regressionRed, pivotLineColor } from "../lib/colors";
import { inspectError } from "../lib/permissionError";

export interface PerCiRow {
  singleAppCI: string;
  ApplicationName: string | null;
  ciname: string | null;
  Tier: string | null;
  Director: string | null;
  preMTTR_ns: number | null;
  postMTTR_ns: number | null;
  preCount: number;
  postCount: number;
  preAffectedUsers: number;
  postAffectedUsers: number;
  mttrPctChange: number | null;
  countPctChange: number | null;
  affectedUsersPctChange: number | null;
}

export interface PerCiTableProps {
  rows: ReadonlyArray<PerCiRow>;
  isLoading: boolean;
  error: unknown;
  onRowSelect: (row: PerCiRow) => void;
  onRefetch?: () => void;
}

function rowVerdict(row: PerCiRow): VerdictFilter {
  const candidates = [row.mttrPctChange, row.countPctChange, row.affectedUsersPctChange];
  if (candidates.some((v) => v === NEW_EMERGENCE_SENTINEL)) return "new";
  const primary = row.affectedUsersPctChange ?? row.countPctChange ?? row.mttrPctChange;
  if (primary === null || primary === undefined || Number.isNaN(primary)) return "all";
  if (primary > 0.01) return "regressed";
  if (primary < -0.01) return "improved";
  return "all";
}

const PctCell = ({ value }: { value: number | null }) => {
  const result = classify(value);
  const display = value === NEW_EMERGENCE_SENTINEL ? "∞" : formatPercent(result.value);
  return (
    <Flex alignItems="center" gap={8} style={{ width: "100%" }}>
      <DivergingBar value={value} width={100} height={10} />
      <Text textStyle="small" style={{ minWidth: 52, textAlign: "right" }}>
        {display}
      </Text>
    </Flex>
  );
};

// Pre value (muted) → post value (bold, colored) + delta badge
const AbsCell = ({
  pre,
  post,
  pctChange: pct,
  format,
}: {
  pre: number | null | undefined;
  post: number | null | undefined;
  pctChange: number | null;
  format: (v: number | null | undefined) => string;
}) => {
  const isNew = pct === NEW_EMERGENCE_SENTINEL;
  const isRegression = pct !== null && !isNew && pct > 0.01;
  const isImprovement = pct !== null && !isNew && pct < -0.01;
  const postColor = isImprovement ? improvementGreen : isRegression ? regressionRed : pivotLineColor;
  const bgColor = isImprovement
    ? `${improvementGreen}1c`
    : isRegression
      ? `${regressionRed}1c`
      : undefined;
  const pctDisplay = isNew ? "+∞" : pct !== null ? formatPercent(classify(pct).value) : null;

  return (
    <Flex alignItems="center" gap={4} style={{ minWidth: 0 }}>
      <Text
        textStyle="small"
        style={{
          color: Colors.Text.Neutral.Default,
          minWidth: 38,
          textAlign: "right",
          flexShrink: 0,
        }}
      >
        {format(pre)}
      </Text>
      <span style={{ color: pivotLineColor, fontSize: 11, flexShrink: 0 }}>→</span>
      <Flex alignItems="center" gap={4} style={{ flexShrink: 0 }}>
        <span style={{ color: postColor, fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>
          {format(post)}
        </span>
        {pctDisplay && (
          <span
            style={{
              fontSize: 10,
              color: postColor,
              fontWeight: 700,
              background: bgColor,
              padding: "1px 5px",
              borderRadius: 3,
              letterSpacing: "0.01em",
              flexShrink: 0,
              lineHeight: 1.6,
            }}
          >
            {pctDisplay}
          </span>
        )}
      </Flex>
    </Flex>
  );
};

export const PerCiTable = ({
  rows,
  isLoading,
  error,
  onRowSelect,
  onRefetch,
}: PerCiTableProps) => {
  const { verdictFilter, setVerdictFilter } = useCrosscheck();
  const [hideInactive, setHideInactive] = useState(true);

  const filtered = useMemo(() => {
    let result = Array.from(rows);
    if (hideInactive) {
      result = result.filter((r) => r.preCount > 0 || r.postCount > 0);
    }
    if (verdictFilter !== "all") {
      result = result.filter((r) => {
        const v = rowVerdict(r);
        if (verdictFilter === "new") return v === "new";
        if (verdictFilter === "regressed") return v === "regressed";
        if (verdictFilter === "improved") return v === "improved";
        return true;
      });
    }
    return result;
  }, [rows, verdictFilter, hideInactive]);

  const inactiveCount = useMemo(
    () => rows.filter((r) => r.preCount === 0 && r.postCount === 0).length,
    [rows],
  );

  const columns = useMemo<DataTableColumnDef<PerCiRow>[]>(
    () => [
      {
        id: "ci",
        header: "ApplicationCI",
        accessor: "singleAppCI",
        width: { type: "auto", maxWidth: 220 },
        cell: ({ rowData }) => (
          <Flex flexDirection="column" gap={2}>
            <Text textStyle="small-emphasized">{rowData.singleAppCI}</Text>
            {rowData.ApplicationName && (
              <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default }}>
                {rowData.ApplicationName}
              </Text>
            )}
          </Flex>
        ),
      },
      {
        id: "tier",
        header: "Tier",
        accessor: "Tier",
        width: 140,
        cell: ({ value }) =>
          value ? (
            <Chip color="neutral" variant="emphasized" size="condensed">
              {String(value)}
            </Chip>
          ) : (
            <Text textStyle="small">—</Text>
          ),
      },
      {
        id: "director",
        header: "Director",
        accessor: "Director",
        width: { type: "auto", maxWidth: 180 },
      },
      {
        id: "mttrPct",
        header: "MTTR Δ",
        accessor: (row: PerCiRow) => row.mttrPctChange,
        width: 200,
        cell: ({ value }) => <PctCell value={typeof value === "number" ? value : null} />,
      },
      {
        id: "countPct",
        header: "Count Δ",
        accessor: (row: PerCiRow) => row.countPctChange,
        width: 200,
        cell: ({ value }) => <PctCell value={typeof value === "number" ? value : null} />,
      },
      {
        id: "impactPct",
        header: "Affected Users Δ",
        accessor: (row: PerCiRow) => row.affectedUsersPctChange,
        width: 200,
        cell: ({ value }) => <PctCell value={typeof value === "number" ? value : null} />,
      },
      {
        id: "affectedUsersAbs",
        header: "Affected Users pre / post",
        accessor: (row: PerCiRow) => row.postAffectedUsers ?? 0,
        width: 230,
        cell: ({ rowData }) => (
          <AbsCell
            pre={rowData.preAffectedUsers}
            post={rowData.postAffectedUsers}
            pctChange={rowData.affectedUsersPctChange}
            format={formatNumber}
          />
        ),
      },
      {
        id: "mttrAbs",
        header: "MTTR pre / post",
        accessor: (row: PerCiRow) => row.postMTTR_ns ?? 0,
        width: 210,
        cell: ({ rowData }) => (
          <AbsCell
            pre={rowData.preMTTR_ns}
            post={rowData.postMTTR_ns}
            pctChange={rowData.mttrPctChange}
            format={formatMttr}
          />
        ),
      },
      {
        id: "countAbs",
        header: "Count pre / post",
        accessor: (row: PerCiRow) => row.postCount,
        width: 200,
        cell: ({ rowData }) => (
          <AbsCell
            pre={rowData.preCount}
            post={rowData.postCount}
            pctChange={rowData.countPctChange}
            format={formatNumber}
          />
        ),
      },
    ],
    [],
  );

  if (error) {
    const info = inspectError(error);
    if (info.isPermission) {
      return (
        <PermissionRequired
          surface="card"
          scope={info.missingScope ?? "storage:events:read"}
          reason="Per-CI rollup couldn't load. Check that your tenant role has access to dt.davis.problems and bizevents."
          onRetry={onRefetch}
        />
      );
    }
    return (
      <Text style={{ color: Colors.Text.Critical.Default }}>
        Failed to load per-CI rollup: {info.rawMessage || "unknown error"}
      </Text>
    );
  }

  return (
    <Flex flexDirection="column" gap={12}>
      <Flex alignItems="center" gap={12} flexFlow="wrap">
        <Text textStyle="small-emphasized">Verdict</Text>
        <ToggleButtonGroup
          value={verdictFilter}
          onChange={(v) => setVerdictFilter(v as VerdictFilter)}
        >
          <ToggleButtonGroup.Item value="all">All</ToggleButtonGroup.Item>
          <ToggleButtonGroup.Item value="regressed">Regressed</ToggleButtonGroup.Item>
          <ToggleButtonGroup.Item value="improved">Improved</ToggleButtonGroup.Item>
          <ToggleButtonGroup.Item value="new">Newly emerged</ToggleButtonGroup.Item>
        </ToggleButtonGroup>
        <Text textStyle="small-emphasized" style={{ marginLeft: 8 }}>Activity</Text>
        <ToggleButtonGroup
          value={hideInactive ? "active" : "all"}
          onChange={(v) => setHideInactive(v === "active")}
        >
          <ToggleButtonGroup.Item value="active">
            Active only
          </ToggleButtonGroup.Item>
          <ToggleButtonGroup.Item value="all">
            Show all{inactiveCount > 0 ? ` (${inactiveCount} inactive)` : ""}
          </ToggleButtonGroup.Item>
        </ToggleButtonGroup>
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default }}>
          showing {filtered.length} of {rows.length} CIs
        </Text>
      </Flex>
      <DataTable
        data={filtered}
        columns={columns}
        loading={isLoading}
        sortable
        interactiveRows
        onActiveRowChange={(rowId) => {
          if (rowId === null) return;
          const idx = Number(rowId);
          const row = filtered[idx];
          if (row) onRowSelect(row);
        }}
        fullWidth
      >
        <DataTable.EmptyState>
          {isLoading
            ? "Loading per-CI data…"
            : "No CIs match the current filters."}
        </DataTable.EmptyState>
      </DataTable>
    </Flex>
  );
};
