export const CANONICAL_TIERS = [
  "1 - most critical",
  "2 - somewhat critical",
  "3 - less critical",
  "4 - not critical",
] as const;

export type CanonicalTier = (typeof CANONICAL_TIERS)[number];

export interface TechOpsRow {
  AppCI: string;
  ApplicationName: string;
  Tier: CanonicalTier;
  Director: string;
}

export interface ParseIssue {
  line: number;
  message: string;
}

export interface ParseResult {
  rows: TechOpsRow[];
  errors: ParseIssue[];
  warnings: ParseIssue[];
}

const REQUIRED_COLUMNS = ["AppCI", "ApplicationName", "Tier", "Director"] as const;
type ColumnName = (typeof REQUIRED_COLUMNS)[number];

export function normalizeTier(raw: string): CanonicalTier | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  for (const canonical of CANONICAL_TIERS) {
    if (canonical.toLowerCase() === trimmed) return canonical;
  }
  const digitMatch = trimmed.match(/[1-4]/);
  if (!digitMatch) return null;
  const idx = Number(digitMatch[0]) - 1;
  return CANONICAL_TIERS[idx] ?? null;
}

function detectDelimiter(headerLine: string): string {
  const tabs = (headerLine.match(/\t/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  return tabs > commas ? "\t" : ",";
}

function parseLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 2;
      } else if (ch === '"') {
        inQuotes = false;
        i++;
      } else {
        current += ch;
        i++;
      }
    } else if (ch === '"' && current === "") {
      inQuotes = true;
      i++;
    } else if (ch === delimiter) {
      out.push(current);
      current = "";
      i++;
    } else {
      current += ch;
      i++;
    }
  }
  out.push(current);
  return out.map((v) => v.trim());
}

function buildHeaderMap(headers: string[]): Record<ColumnName, number> | string {
  const lower = headers.map((h) => h.toLowerCase());
  const map: Partial<Record<ColumnName, number>> = {};
  for (const col of REQUIRED_COLUMNS) {
    const idx = lower.indexOf(col.toLowerCase());
    if (idx === -1) return col;
    map[col] = idx;
  }
  return map as Record<ColumnName, number>;
}

export function parseTechOpsCsv(input: string): ParseResult {
  const errors: ParseIssue[] = [];
  const warnings: ParseIssue[] = [];
  const rows: TechOpsRow[] = [];

  const trimmed = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!trimmed) {
    errors.push({ line: 0, message: "Input is empty." });
    return { rows, errors, warnings };
  }

  const lines = trimmed.split("\n");
  const delimiter = detectDelimiter(lines[0]);
  const headers = parseLine(lines[0], delimiter);
  const headerMap = buildHeaderMap(headers);
  if (typeof headerMap === "string") {
    errors.push({
      line: 1,
      message: `Required column "${headerMap}" not found in header row. Expected: ${REQUIRED_COLUMNS.join(", ")}.`,
    });
    return { rows, errors, warnings };
  }

  const seenAppCI = new Map<string, number>();
  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i];
    if (!raw.trim()) continue;
    const fields = parseLine(raw, delimiter);
    const appCi = fields[headerMap.AppCI] ?? "";
    const applicationName = fields[headerMap.ApplicationName] ?? "";
    const tierRaw = fields[headerMap.Tier] ?? "";
    const director = fields[headerMap.Director] ?? "";

    if (!appCi) {
      errors.push({ line: lineNo, message: "AppCI is required." });
      continue;
    }
    const key = appCi.toLowerCase();
    if (seenAppCI.has(key)) {
      errors.push({
        line: lineNo,
        message: `Duplicate AppCI "${appCi}" (also on line ${seenAppCI.get(key)}).`,
      });
      continue;
    }
    seenAppCI.set(key, lineNo);

    const tier = normalizeTier(tierRaw);
    if (!tier) {
      errors.push({
        line: lineNo,
        message: `Tier "${tierRaw}" not recognized. Accepted: 1-4, T1-T4, "Tier 1", or the canonical strings.`,
      });
      continue;
    }
    if (!applicationName) {
      warnings.push({
        line: lineNo,
        message: `ApplicationName is empty for AppCI "${appCi}".`,
      });
    }
    if (!director) {
      warnings.push({
        line: lineNo,
        message: `Director is empty for AppCI "${appCi}".`,
      });
    }

    rows.push({
      AppCI: appCi,
      ApplicationName: applicationName,
      Tier: tier,
      Director: director,
    });
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push({ line: 0, message: "No data rows found below the header." });
  }

  return { rows, errors, warnings };
}
