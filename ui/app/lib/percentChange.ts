export const NEW_EMERGENCE_SENTINEL = 9999;
export const DEFAULT_CLIP = 300;

export interface PctResult {
  value: number | null;
  display: number | null;
  clipped: boolean;
}

// classify() is purely about clipping math; sentinel detection (NEW_EMERGENCE_SENTINEL)
// is handled at the component level so each caller can choose its own display.
export function classify(
  rawPercent: number | null | undefined,
  clip: number = DEFAULT_CLIP,
): PctResult {
  if (rawPercent === null || rawPercent === undefined || Number.isNaN(rawPercent)) {
    return { value: null, display: null, clipped: false };
  }
  const clamped = Math.max(-clip, Math.min(clip, rawPercent));
  return {
    value: rawPercent,
    display: clamped,
    clipped: clamped !== rawPercent,
  };
}

export function pctChange(
  pre: number | null | undefined,
  post: number | null | undefined,
): number | null {
  const preN = pre !== null && pre !== undefined && !Number.isNaN(pre) ? pre : null;
  const postN = post !== null && post !== undefined && !Number.isNaN(post) ? post : null;

  if (preN === null) {
    if (postN === null || postN === 0) return null;
    return NEW_EMERGENCE_SENTINEL;
  }
  if (preN === 0) {
    if (postN === null || postN === 0) return null;
    return NEW_EMERGENCE_SENTINEL;
  }
  // preN > 0 — postN === 0 yields -100 via normal arithmetic, which is a real improvement
  if (postN === null) return null;
  return ((postN - preN) / preN) * 100;
}

export type Verdict = "regressed" | "improved" | "new" | "stable";

export function verdictFor(
  pre: number | null | undefined,
  post: number | null | undefined,
): Verdict {
  const raw = pctChange(pre, post);
  if (raw === null) return "stable";
  if (raw === NEW_EMERGENCE_SENTINEL) return "new";
  if (raw > 0.01) return "regressed";
  if (raw < -0.01) return "improved";
  return "stable";
}
