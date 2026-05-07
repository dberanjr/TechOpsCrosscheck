import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useDql,
  useUserAppState,
  useSetUserAppState,
  useDeleteUserAppState,
} from "@dynatrace-sdk/react-hooks";
import { getCurrentUserDetails } from "@dynatrace-sdk/app-environment";
import { techopsApplicationListQuery } from "../../queries/techopsApplicationList";
import type { ProblemScope } from "../../queries/dqlUtils";
import {
  CANONICAL_TIERS,
  type CanonicalTier,
  type TechOpsRow,
  normalizeTier,
} from "../lib/parseTechOpsCsv";
import { inspectError } from "../lib/permissionError";

export const UPLOADED_KEY = "techops:applicationList:uploaded";
export const SAVED_PIVOTS_KEY = "techops:savedPivots";

export type Source = "central" | "uploaded";
export type CentralStatus =
  | "loading"
  | "ok"
  | "empty"
  | "permissionDenied"
  | "error";
export type VerdictFilter = "all" | "regressed" | "improved" | "new";
export type { ProblemScope };

export interface SavedPivot {
  id: string;
  name: string;
  pivotIso: string;
  windowDays: number;
  annotation?: string;
  createdAt: string;
}

interface UploadedPayload {
  rows: TechOpsRow[];
  uploadedAt: string;
  uploadedBy?: string;
}

interface SavedPivotsPayload {
  pivots: SavedPivot[];
}

export interface CrosscheckContextValue {
  pivotIso: string;
  windowDays: number;
  appCiFilter: readonly string[];
  tierFilter: readonly string[];
  directorFilter: readonly string[];
  verdictFilter: VerdictFilter;
  problemScope: ProblemScope;

  centralRows: readonly TechOpsRow[] | null;
  centralStatus: CentralStatus;
  centralLoadedAt: Date | null;
  centralMissingScope: string | null;
  centralRawError: unknown;

  uploadedRows: readonly TechOpsRow[] | null;
  uploadedAt: string | null;
  uploadedBy: string | null;

  activeSource: Source | null;
  applicationList: readonly TechOpsRow[];

  savedPivots: readonly SavedPivot[];

  setPivotIso: (value: string) => void;
  setWindowDays: (value: number) => void;
  setAppCiFilter: (values: readonly string[]) => void;
  setTierFilter: (values: readonly string[]) => void;
  setDirectorFilter: (values: readonly string[]) => void;
  setVerdictFilter: (value: VerdictFilter) => void;
  setProblemScope: (value: ProblemScope) => void;

  switchSource: (source: Source) => void;
  saveUploadedTable: (rows: readonly TechOpsRow[]) => Promise<void>;
  clearUploadedTable: () => Promise<void>;

  saveSavedPivot: (pivot: Omit<SavedPivot, "id" | "createdAt">) => Promise<SavedPivot>;
  updateSavedPivot: (id: string, patch: Partial<SavedPivot>) => Promise<void>;
  deleteSavedPivot: (id: string) => Promise<void>;
  loadSavedPivot: (id: string) => void;

  refetchCentral: () => void;
}

const CrosscheckContext = createContext<CrosscheckContextValue | null>(null);

const DEFAULT_PIVOT_ISO = "2026-02-01";
const DEFAULT_WINDOW_DAYS = 90;

interface DqlRecord {
  AppCI?: string;
  ApplicationName?: string;
  Tier?: string;
  Director?: string;
}

function recordsToRows(records: ReadonlyArray<DqlRecord> | undefined | null): TechOpsRow[] {
  if (!records) return [];
  const out: TechOpsRow[] = [];
  for (const r of records) {
    const appCi = (r.AppCI ?? "").trim();
    if (!appCi) continue;
    const tier = normalizeTier(r.Tier ?? "");
    if (!tier) continue;
    out.push({
      AppCI: appCi,
      ApplicationName: (r.ApplicationName ?? "").trim(),
      Tier: tier,
      Director: (r.Director ?? "").trim(),
    });
  }
  return out;
}

function safeUserEmail(): string {
  try {
    return getCurrentUserDetails().email || "";
  } catch {
    return "";
  }
}

function parseUploadedValue(value: string | undefined): UploadedPayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as UploadedPayload;
    if (!parsed || !Array.isArray(parsed.rows)) return null;
    const rows: TechOpsRow[] = [];
    for (const r of parsed.rows) {
      if (!r || typeof r.AppCI !== "string" || !r.AppCI) continue;
      const tier: CanonicalTier | null =
        CANONICAL_TIERS.find((t) => t === r.Tier) ?? normalizeTier(r.Tier ?? "");
      if (!tier) continue;
      rows.push({
        AppCI: r.AppCI,
        ApplicationName: r.ApplicationName ?? "",
        Tier: tier,
        Director: r.Director ?? "",
      });
    }
    return {
      rows,
      uploadedAt: parsed.uploadedAt ?? new Date().toISOString(),
      uploadedBy: parsed.uploadedBy,
    };
  } catch {
    return null;
  }
}

function parseSavedPivotsValue(value: string | undefined): SavedPivot[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as SavedPivotsPayload;
    return Array.isArray(parsed?.pivots) ? parsed.pivots : [];
  } catch {
    return [];
  }
}

export const CrosscheckProvider = ({ children }: { children: React.ReactNode }) => {
  const [pivotIso, setPivotIso] = useState(DEFAULT_PIVOT_ISO);
  const [windowDays, setWindowDays] = useState(DEFAULT_WINDOW_DAYS);
  const [appCiFilter, setAppCiFilter] = useState<readonly string[]>([]);
  const [tierFilter, setTierFilter] = useState<readonly string[]>([]);
  const [directorFilter, setDirectorFilter] = useState<readonly string[]>([]);
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>("all");
  const [problemScope, setProblemScope] = useState<ProblemScope>("business");
  const [explicitSource, setExplicitSource] = useState<Source | null>(null);
  const [centralLoadedAt, setCentralLoadedAt] = useState<Date | null>(null);

  const centralQuery = useMemo(() => techopsApplicationListQuery(), []);
  const central = useDql({ query: centralQuery });

  const uploaded = useUserAppState({ key: UPLOADED_KEY });
  const savedPivotsState = useUserAppState({ key: SAVED_PIVOTS_KEY });
  const setUserState = useSetUserAppState();
  const deleteUserState = useDeleteUserAppState();

  const centralStatus: CentralStatus = useMemo(() => {
    if (central.isLoading) return "loading";
    if (central.error) {
      const info = inspectError(central.error);
      if (info.isPermission) return "permissionDenied";
      return "error";
    }
    const rows = recordsToRows(central.data?.records);
    return rows.length > 0 ? "ok" : "empty";
  }, [central.isLoading, central.error, central.data]);

  const centralRows = useMemo(() => {
    if (centralStatus !== "ok") return null;
    return recordsToRows(central.data?.records);
  }, [centralStatus, central.data]);

  const centralMissingScope = useMemo(() => {
    if (centralStatus !== "permissionDenied") return null;
    return inspectError(central.error).missingScope ?? "storage:buckets:read";
  }, [centralStatus, central.error]);

  useEffect(() => {
    if (centralStatus === "ok" && !centralLoadedAt) {
      setCentralLoadedAt(new Date());
    }
  }, [centralStatus, centralLoadedAt]);

  const uploadedPayload = useMemo(
    () => parseUploadedValue(uploaded.data?.value),
    [uploaded.data?.value],
  );
  const uploadedRows = uploadedPayload?.rows ?? null;
  const uploadedAt = uploadedPayload?.uploadedAt ?? null;
  const uploadedBy = uploadedPayload?.uploadedBy ?? null;

  const savedPivots = useMemo(
    () => parseSavedPivotsValue(savedPivotsState.data?.value),
    [savedPivotsState.data?.value],
  );

  const activeSource: Source | null = useMemo(() => {
    if (explicitSource === "central" && centralRows && centralRows.length > 0) return "central";
    if (explicitSource === "uploaded" && uploadedRows) return "uploaded";
    if (centralRows && centralRows.length > 0) return "central";
    if (uploadedRows && uploadedRows.length > 0) return "uploaded";
    return null;
  }, [explicitSource, centralRows, uploadedRows]);

  const applicationList = useMemo<readonly TechOpsRow[]>(() => {
    if (activeSource === "central") return centralRows ?? [];
    if (activeSource === "uploaded") return uploadedRows ?? [];
    return [];
  }, [activeSource, centralRows, uploadedRows]);

  const switchSource = useCallback((source: Source) => {
    setExplicitSource(source);
  }, []);

  const writeUploaded = useCallback(
    async (payload: UploadedPayload | null) => {
      if (payload === null) {
        await deleteUserState.execute({ key: UPLOADED_KEY });
      } else {
        await setUserState.execute({
          key: UPLOADED_KEY,
          body: { value: JSON.stringify(payload) },
        });
      }
      await uploaded.refetch();
    },
    [setUserState, deleteUserState, uploaded],
  );

  const saveUploadedTable = useCallback(
    async (rows: readonly TechOpsRow[]) => {
      const payload: UploadedPayload = {
        rows: rows.map((r) => ({ ...r })),
        uploadedAt: new Date().toISOString(),
        uploadedBy: safeUserEmail() || undefined,
      };
      await writeUploaded(payload);
      setExplicitSource("uploaded");
    },
    [writeUploaded],
  );

  const clearUploadedTable = useCallback(async () => {
    await writeUploaded(null);
    if (centralRows && centralRows.length > 0) setExplicitSource("central");
    else setExplicitSource(null);
  }, [writeUploaded, centralRows]);

  const writeSavedPivots = useCallback(
    async (pivots: SavedPivot[]) => {
      await setUserState.execute({
        key: SAVED_PIVOTS_KEY,
        body: { value: JSON.stringify({ pivots } satisfies SavedPivotsPayload) },
      });
      await savedPivotsState.refetch();
    },
    [setUserState, savedPivotsState],
  );

  const saveSavedPivot = useCallback(
    async (input: Omit<SavedPivot, "id" | "createdAt">) => {
      const next: SavedPivot = {
        ...input,
        id: `sp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
      };
      await writeSavedPivots([...savedPivots, next]);
      return next;
    },
    [writeSavedPivots, savedPivots],
  );

  const updateSavedPivot = useCallback(
    async (id: string, patch: Partial<SavedPivot>) => {
      await writeSavedPivots(
        savedPivots.map((p) => (p.id === id ? { ...p, ...patch, id: p.id } : p)),
      );
    },
    [writeSavedPivots, savedPivots],
  );

  const deleteSavedPivot = useCallback(
    async (id: string) => {
      await writeSavedPivots(savedPivots.filter((p) => p.id !== id));
    },
    [writeSavedPivots, savedPivots],
  );

  const loadSavedPivot = useCallback(
    (id: string) => {
      const target = savedPivots.find((p) => p.id === id);
      if (!target) return;
      setPivotIso(target.pivotIso);
      setWindowDays(target.windowDays);
    },
    [savedPivots],
  );

  const refetchCentralRef = useRef(central.refetch);
  refetchCentralRef.current = central.refetch;
  const refetchCentral = useCallback(() => {
    void refetchCentralRef.current();
  }, []);

  const value: CrosscheckContextValue = {
    pivotIso,
    windowDays,
    appCiFilter,
    tierFilter,
    directorFilter,
    verdictFilter,
    problemScope,
    centralRows,
    centralStatus,
    centralLoadedAt,
    centralMissingScope,
    centralRawError: central.error,
    uploadedRows,
    uploadedAt,
    uploadedBy,
    activeSource,
    applicationList,
    savedPivots,
    setPivotIso,
    setWindowDays,
    setAppCiFilter,
    setTierFilter,
    setDirectorFilter,
    setVerdictFilter,
    setProblemScope,
    switchSource,
    saveUploadedTable,
    clearUploadedTable,
    saveSavedPivot,
    updateSavedPivot,
    deleteSavedPivot,
    loadSavedPivot,
    refetchCentral,
  };

  return (
    <CrosscheckContext.Provider value={value}>{children}</CrosscheckContext.Provider>
  );
};

export function useCrosscheck(): CrosscheckContextValue {
  const ctx = useContext(CrosscheckContext);
  if (!ctx) {
    throw new Error("useCrosscheck must be called inside <CrosscheckProvider>");
  }
  return ctx;
}
