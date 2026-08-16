/**
 * Minimal client-failure reporting.
 *
 * This is not an analytics layer and should not grow into one. The only thing it ships is
 * "something broke, here is the shape of it", because right now a failure in the browser
 * leaves no trace anywhere we can see — `STREAM_TRUNCATED` in particular is the only health
 * signal the core chat path has, and today it is thrown away.
 *
 * Three rules it must never break:
 *
 * 1. **No user content.** No message text, no draft, no query string, no full URL. The backend
 *    contract is a closed schema with no free-form bag, so there is nowhere for chat text to go
 *    even by accident.
 * 2. **Never becomes the failure it reports.** Every path swallows its own errors, nothing is
 *    retried, and no caller ever awaits a flush.
 * 3. **Bounded.** Identical failures merge into one event with a `count`, and a tab reports a
 *    fixed number of *distinct* failures. See MAX_KEYS_PER_SESSION for why that beats sampling.
 */

import { csrfHeader } from "./cookies.ts";

const ENDPOINT = "/api/v1/products/plum/client-events";
/** Collect a burst into one request. A broken render fires dozens of errors in a few ms. */
const FLUSH_DELAY_MS = 3_000;
/** Matches the backend's per-batch cap; a longer queue carries over to the next flush. */
const MAX_BATCH = 20;
/**
 * Distinct failures a tab will report. Deliberately a cap on *distinct* failures rather than
 * random sampling: identical ones merge with a `count`, so magnitude survives exactly while
 * volume stays bounded. Sampling would destroy the one thing we need — "happened once" and
 * "happened a thousand times" would both arrive as "once".
 */
const MAX_KEYS_PER_SESSION = 50;
/** Enough to see the shape of a stack-less browser error, short enough to never carry prose. */
const MAX_DETAIL_CHARS = 200;

type ClientEvent = {
  name: string;
  at: number;
  page: string;
  count: number;
  code?: string;
  status?: number;
  method?: string;
  path?: string;
  timeout_ms?: number;
  detail?: string;
};

const queue = new Map<string, ClientEvent>();
/**
 * Errors already reported at the point they were understood. The global handlers skip these so
 * an unhandled `ApiError` is one event, not two with different names.
 */
const reported = new WeakSet<object>();

let sessionId = "";
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let installed = false;

function ensureSessionId() {
  if (sessionId) return sessionId;
  sessionId = globalThis.crypto?.randomUUID?.() ?? `s${Math.random().toString(36).slice(2, 14)}`;
  return sessionId;
}

/**
 * Collapse the identifying parts of a path so it can be grouped and cannot carry an id.
 *
 * Cardinality is the practical reason (`/chat/char_a`, `/chat/char_b`… are one route, not two
 * hundred), but the privacy reason is the binding one: `?work_id=` and character ids have no
 * business in a log line.
 */
export function normalizePath(input: string) {
  const path = input.split("?")[0].split("#")[0];
  return path
    .split("/")
    .map((segment) => {
      if (!segment) return segment;
      if (/^(char|conv|msg|turn|work|user|guest)_/.test(segment)) return "{id}";
      if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(segment)) return "{id}";
      if (segment.length > 24) return "{id}";
      return segment;
    })
    .join("/");
}

function scrub(value: string) {
  // Newlines would let a browser-supplied message forge extra lines in our server log.
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, MAX_DETAIL_CHARS);
}

function currentPage() {
  if (typeof window === "undefined") return "";
  return normalizePath(window.location.pathname);
}

type TrackInput = Omit<ClientEvent, "at" | "count" | "page"> & { page?: string };

/** Queue one failure. Cheap, synchronous, and never throws. */
export function track(event: TrackInput) {
  try {
    if (typeof window === "undefined") return;
    const entry: ClientEvent = {
      ...event,
      detail: event.detail ? scrub(event.detail) : undefined,
      page: event.page ?? currentPage(),
      at: Date.now(),
      count: 1,
    };
    const key = `${entry.name}|${entry.code ?? ""}|${entry.status ?? ""}|${entry.path ?? ""}|${entry.page}`;
    const existing = queue.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }
    // Past the cap we stop adding new keys but keep counting the ones already known, so a
    // runaway loop cannot grow the payload and cannot hide the failures we already saw.
    if (queue.size >= MAX_KEYS_PER_SESSION) return;
    queue.set(key, entry);
    if (flushTimer === null) flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
  } catch {
    // A reporter that throws is worse than one that misses an event.
  }
}

/** Mark an error as already reported, so the global handlers do not report it a second time. */
export function markReported(error: unknown) {
  if (error && typeof error === "object") reported.add(error as object);
}

/**
 * Statuses worth a log line. The rest are the server answering correctly: 401 is a signed-out
 * visitor, 402 is an empty wallet, 409 is a second turn in the same conversation. Reporting
 * those would bury the failures in normal traffic.
 *
 * 422 and 403 are in because they mean *we* are wrong: a body the server refuses to parse, or
 * a CSRF double-submit that did not line up.
 */
function worthReporting(status: number) {
  return status === 0 || status === 403 || status === 408 || status === 422 || status >= 500;
}

/** Report a failed API call. Duck-typed so this module stays independent of `api.ts`. */
export function reportApiFailure(input: { method: string; path: string; error: unknown; attempt?: number }) {
  const { error } = input;
  const status = typeof (error as { status?: unknown })?.status === "number"
    ? (error as { status: number }).status
    : 0;
  if (!worthReporting(status)) return;
  markReported(error);
  track({
    name: "api_error",
    method: input.method,
    path: normalizePath(input.path),
    status,
    code: error instanceof Error ? error.message.slice(0, 64) : undefined,
    timeout_ms: typeof (error as { timeoutMs?: unknown })?.timeoutMs === "number"
      ? (error as { timeoutMs: number }).timeoutMs
      : undefined,
    detail: input.attempt && input.attempt > 1 ? `attempt=${input.attempt}` : undefined,
  });
}

/**
 * Report a turn-stream failure. Always reported, whatever the status: this is the core path,
 * and `STREAM_TRUNCATED` / `STREAM_INVALID_EVENT` are the only signals it has.
 *
 * `timeout_ms` is what separates the two ways a stream dies — 15000 means it never connected,
 * 45000 means it connected and then went silent. See TECH-02 §13.3.
 */
export function reportStreamFailure(input: { error: unknown; retrying: boolean }) {
  const { error } = input;
  if (!input.retrying) markReported(error);
  track({
    name: input.retrying ? "stream_retry" : "stream_failed",
    path: "/conversations/{id}/turns/stream",
    status: typeof (error as { status?: unknown })?.status === "number"
      ? (error as { status: number }).status
      : 0,
    code: error instanceof Error ? error.message.slice(0, 64) : "unknown",
    timeout_ms: typeof (error as { timeoutMs?: unknown })?.timeoutMs === "number"
      ? (error as { timeoutMs: number }).timeoutMs
      : undefined,
  });
}

/** Send what is queued and forget about it. Safe to call at any time, including on unload. */
export function flush() {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!queue.size || typeof fetch === "undefined") return;
  const keys = [...queue.keys()].slice(0, MAX_BATCH);
  const events = keys.map((key) => queue.get(key)!);
  for (const key of keys) queue.delete(key);
  if (queue.size) flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
  try {
    void fetch(ENDPOINT, {
      method: "POST",
      // Survives the page being torn down, which is exactly when the last errors arrive.
      // `navigator.sendBeacon` would too, but it cannot set the CSRF header.
      keepalive: true,
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...csrfHeader() },
      body: JSON.stringify({ session_id: ensureSessionId(), events }),
    }).catch(() => undefined);
  } catch {
    // Dropped on purpose. Reporting is never retried: a backend that is down would otherwise
    // get a retry storm from every open tab, on top of whatever is already wrong.
  }
}

/** Install the global handlers. Idempotent, and a no-op on the server. */
export function installClientErrorReporting() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (event) => {
    if (event.error && typeof event.error === "object" && reported.has(event.error)) return;
    track({
      name: "unhandled_error",
      code: event.error instanceof Error ? event.error.name : "Error",
      // Source position, not the source: enough to find the frame in a sourcemap.
      detail: `${event.message} @ ${normalizePath(event.filename ?? "")}:${event.lineno}:${event.colno}`,
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason: unknown = event.reason;
    if (reason && typeof reason === "object" && reported.has(reason as object)) return;
    track({
      name: "unhandled_rejection",
      code: reason instanceof Error ? reason.name : typeof reason,
      status: typeof (reason as { status?: unknown })?.status === "number"
        ? (reason as { status: number }).status
        : undefined,
      detail: reason instanceof Error ? reason.message : undefined,
    });
  });
  // `pagehide` fires on navigation away and on mobile backgrounding; `visibilitychange` is the
  // one that fires when an iOS tab is discarded without ever firing `pagehide`.
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

/** Test seam: drop queued state between cases. */
export function resetTelemetryForTests() {
  queue.clear();
  if (flushTimer !== null) clearTimeout(flushTimer);
  flushTimer = null;
  installed = false;
  sessionId = "";
}
