const NS_PER_DAY = 86_400_000_000_000;
const NS_PER_HOUR = 3_600_000_000_000;
const NS_PER_MINUTE = 60_000_000_000;

const usdCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const usdFull = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const numberCompact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const numberFull = new Intl.NumberFormat("en-US");

const dateLong = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

const dateLongUtc = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const dateCompactUtc = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (Math.abs(value) >= 10_000) return usdCompact.format(value);
  return usdFull.format(value);
}

export function formatPercent(
  value: number | null | undefined,
  decimals = 1,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatMttr(nanoseconds: number | null | undefined): string {
  if (
    nanoseconds === null ||
    nanoseconds === undefined ||
    Number.isNaN(nanoseconds)
  ) {
    return "—";
  }
  if (nanoseconds >= NS_PER_DAY) {
    return `${(nanoseconds / NS_PER_DAY).toFixed(1)}d`;
  }
  if (nanoseconds >= NS_PER_HOUR) {
    return `${(nanoseconds / NS_PER_HOUR).toFixed(1)}h`;
  }
  if (nanoseconds >= NS_PER_MINUTE) {
    return `${(nanoseconds / NS_PER_MINUTE).toFixed(1)}m`;
  }
  return `${(nanoseconds / 1_000_000_000).toFixed(1)}s`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (Math.abs(value) >= 10_000) return numberCompact.format(value);
  return numberFull.format(value);
}

export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return dateLong.format(d);
}

/** Format a UTC ISO string as "Nov 3, 2025" — uses UTC timezone to avoid date shifting. */
export function formatDateUtc(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return dateLongUtc.format(d);
}

/** Format a UTC ISO string as "Nov 3" (no year) for compact sparkline labels. */
export function formatDateCompact(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return dateCompactUtc.format(d);
}
