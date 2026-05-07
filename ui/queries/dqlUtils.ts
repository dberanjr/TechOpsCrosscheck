// Shared helpers for safely composing DQL strings from JS values.
// The dt-app dql_search and notebook tooling are upstream of this layer; queries
// produced here must be valid DQL on their own.

export const IMPACT_LEVELS = [
  "Application",
  "Environment",
  "Infrastructure",
  "Services",
  "Synthetic",
];
export const STATUSES = ["ACTIVE", "CLOSED"];
export const USER_IMPACT_VALUES = ["YES", "NO"];

// Business-impacting problems: Error and Slowdown.
export const BUSINESS_CATEGORIES = ["ERROR", "SLOWDOWN"] as const;

// Operational problems: availability, resource, custom alert, monitoring gaps.
export const OPERATIONAL_CATEGORIES = [
  "AVAILABILITY",
  "RESOURCE_CONTENTION",
  "CUSTOM_ALERT",
  "MONITORING_UNAVAILABLE",
] as const;

/** Controls which problem categories flow into every query. */
export type ProblemScope = "business" | "operational" | "all";

/** Returns the DQL filter line (or empty string) for the given scope.
 *  Insert this immediately after the is_duplicate filter in every query. */
export function categoryFilterLine(scope: ProblemScope): string {
  if (scope === "business")
    return `| filter ${dqlIn("event.category", BUSINESS_CATEGORIES)}`;
  if (scope === "operational")
    return `| filter ${dqlIn("event.category", OPERATIONAL_CATEGORIES)}`;
  return ""; // "all" — no category restriction
}

export function dqlString(value: string): string {
  return '"' + value.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

export function dqlIn(field: string, values: readonly string[]): string {
  if (values.length === 0) {
    throw new Error(
      `dqlIn called with empty values for field ${field}; use dqlInFilterLine to skip the filter`,
    );
  }
  return `in(${field}, ${values.map(dqlString).join(", ")})`;
}

// Returns a `| filter in(...)` line, or an empty string if the values array is
// empty. Empty lines between pipes are valid DQL, so callers can splat the
// result into a multi-line template literal without a conditional.
export function dqlInFilterLine(field: string, values: readonly string[]): string {
  if (values.length === 0) return "";
  return `| filter ${dqlIn(field, values)}`;
}

export function isoUtcMidnight(pivotIso: string): string {
  return /T/.test(pivotIso) ? pivotIso : `${pivotIso}T00:00:00Z`;
}

export function isoOffsetHours(pivotIso: string, hourOffset: number): string {
  const d = new Date(isoUtcMidnight(pivotIso));
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid pivot ISO: ${pivotIso}`);
  }
  d.setUTCMilliseconds(d.getUTCMilliseconds() + hourOffset * 3_600_000);
  return d.toISOString();
}

export interface WindowRange {
  pivotIso: string;
  preStartIso: string;
  postEndIso: string;
}

export function windowRange(pivotIso: string, windowDays: number): WindowRange {
  return {
    pivotIso: isoUtcMidnight(pivotIso),
    preStartIso: isoOffsetHours(pivotIso, -24 * windowDays),
    postEndIso: isoOffsetHours(pivotIso, +24 * windowDays),
  };
}

/**
 * Returns a scanLimitGBytes value appropriate for the number of days being
 * scanned. Grail's default is often too low for large TechOps windows (90-365d).
 * Pass the *total* scan span in days (pre + post for full-window queries,
 * just windowDays for single-side queries).
 */
export function scanLimitGBytes(scanDays: number): number {
  if (scanDays <= 60)  return 1_000;
  if (scanDays <= 180) return 5_000;
  if (scanDays <= 400) return 10_000;
  return 20_000;
}
