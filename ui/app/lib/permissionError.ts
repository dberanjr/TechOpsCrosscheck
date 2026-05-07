// Centralized permission-error detection. Errors surfaced by useDql, the state
// SDK, and other Grail clients can be HttpClientResponseError instances or
// plain Error objects whose message carries the HTTP status. We normalize both.

interface MaybeHttpError {
  response?: { status?: number; body?: unknown };
  status?: number;
  message?: string;
}

export interface PermissionErrorInfo {
  isPermission: boolean;
  status: number | null;
  missingScope: string | null;
  rawMessage: string;
}

const SCOPE_REGEX = /\b([a-z]+(?::[a-z-]+)+:(?:read|write|execute))\b/i;

export function inspectError(err: unknown): PermissionErrorInfo {
  if (!err) {
    return { isPermission: false, status: null, missingScope: null, rawMessage: "" };
  }
  const e = err as MaybeHttpError;
  const status = e.response?.status ?? e.status ?? null;
  const rawMessage =
    typeof err === "string" ? err : (e.message ?? "");
  const isPermission =
    status === 401 ||
    status === 403 ||
    /forbidden|unauthori[sz]ed|missing scope|insufficient/i.test(rawMessage);
  const scopeMatch = rawMessage.match(SCOPE_REGEX);
  return {
    isPermission,
    status,
    missingScope: scopeMatch ? scopeMatch[1] : null,
    rawMessage,
  };
}

export function isPermissionError(err: unknown): boolean {
  return inspectError(err).isPermission;
}
