import type { AuthContext, AuthUser, CharacterExperience, ChatMessage, Conversation, FeedCharacter, GuestProfile, GuestQuota, ModelProfile, Wallet } from "./types";

const BASE = "/api/v1/products/plum";

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export class StreamProtocolError extends Error {
  constructor(public readonly code: "STREAM_INVALID_EVENT" | "STREAM_TRUNCATED") {
    super(code);
    this.name = "StreamProtocolError";
  }
}

type StreamBase = { version: 1; turn_id: string };

export type TurnStreamEvent =
  | ({ type: "turn.accepted"; request_id: string; model_profile: ModelProfile["profile"]; reserved_coins: number; deduplicated?: boolean } & StreamBase)
  | ({ type: "message.delta"; seq: number; text: string } & StreamBase)
  | ({ type: "turn.completed"; message_id: string | null; finish_reason: string; charged_coins: number; wallet: Wallet | null; guest_quota?: GuestQuota; deduplicated: boolean } & StreamBase)
  | ({ type: "turn.cancelled"; message_id: string | null; charged_coins: number; wallet: Wallet | null; guest_quota?: GuestQuota } & StreamBase)
  | ({ type: "turn.failed"; code: string; retryable: boolean; charged_coins: number; wallet: Wallet | null; guest_quota?: GuestQuota } & StreamBase);

type SseRecord = { event: string; data: string };

/** Parse all complete SSE records and retain an incomplete tail for the next chunk. */
export function parseSseRecords(input: string): { records: SseRecord[]; remainder: string } {
  const records: SseRecord[] = [];
  let offset = 0;
  const boundary = /\r?\n\r?\n/g;
  for (let match = boundary.exec(input); match; match = boundary.exec(input)) {
    const block = input.slice(offset, match.index);
    offset = match.index + match[0].length;
    let event = "message";
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (!line || line.startsWith(":")) continue;
      const separator = line.indexOf(":");
      const field = separator === -1 ? line : line.slice(0, separator);
      let value = separator === -1 ? "" : line.slice(separator + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "event") event = value;
      if (field === "data") data.push(value);
    }
    if (data.length > 0) records.push({ event, data: data.join("\n") });
  }
  return { records, remainder: input.slice(offset) };
}

function toTurnStreamEvent(record: SseRecord): TurnStreamEvent | null {
  const knownEvents = new Set(["turn.accepted", "message.delta", "turn.completed", "turn.cancelled", "turn.failed"]);
  if (!knownEvents.has(record.event)) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(record.data);
  } catch {
    throw new StreamProtocolError("STREAM_INVALID_EVENT");
  }
  if (!payload || typeof payload !== "object") throw new StreamProtocolError("STREAM_INVALID_EVENT");
  return { ...(payload as Omit<TurnStreamEvent, "type">), type: record.event } as TurnStreamEvent;
}

function cookieValue(name: string) {
  if (typeof document === "undefined") return "";
  const prefix = `${encodeURIComponent(name)}=`;
  return document.cookie.split("; ").find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? "";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const csrf = !["GET", "HEAD", "OPTIONS"].includes(method) ? cookieValue("plum_csrf") : "";
  const hasFormBody = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      ...(init?.body && !hasFormBody ? { "Content-Type": "application/json" } : {}),
      ...(csrf ? { "X-Plum-CSRF": decodeURIComponent(csrf) } : {}),
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof payload.detail === "string" ? payload.detail : "request_failed";
    throw new ApiError(detail, response.status);
  }
  return payload as T;
}

export type CreatorMedia = {
  media_id: string;
  mime: "image/jpeg" | "image/png";
  bytes: number;
  width: number;
  height: number;
  preview_url: string;
  pending_expires_at: string;
};

export function uploadCreatorPortrait(file: File) {
  const body = new FormData();
  body.append("file", file);
  body.append("kind", "image");
  body.append("purpose", "character_portrait");
  return request<{ status: string; media: CreatorMedia }>("/creator/media/uploads", {
    method: "POST",
    body,
  });
}

export function getBootstrap() {
  return request<{
    status: string;
    user: AuthUser;
    wallet: Wallet;
    models: ModelProfile[];
    capabilities: { chat_streaming: boolean };
  }>("/bootstrap");
}

export function getAuthContext() {
  return request<AuthContext>("/auth/context");
}

export function createGuestSession() {
  return request<AuthContext>("/auth/guest/session", { method: "POST" });
}

export function updateGuestProfile(profile: GuestProfile & { adult_confirmed: boolean }) {
  return request<AuthContext>("/auth/guest/profile", {
    method: "PATCH",
    body: JSON.stringify(profile),
  });
}

export function requestEmailChallenge(email: string) {
  return request<{ status: "accepted"; challenge_id: string; retry_after_seconds: number }>("/auth/email/challenges", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function verifyEmailChallenge(challengeId: string, code: string, preferredName?: string) {
  return request<{
    status: "ok";
    actor: { kind: "member"; user: AuthUser };
    is_new_membership: boolean;
    grant: { amount: number; was_applied: boolean };
    wallet: Wallet;
    expires_at: string;
  }>("/auth/email/verify", {
    method: "POST",
    body: JSON.stringify({ challenge_id: challengeId, code, ...(preferredName?.trim() ? { preferred_name: preferredName.trim() } : {}) }),
  });
}

export function redeemAccessCode(accessCode: string, displayName: string) {
  return request<{ status: string; user: AuthUser; wallet: Wallet; expires_at: string }>("/auth/access-code", {
    method: "POST",
    body: JSON.stringify({ access_code: accessCode, display_name: displayName }),
  });
}

export function logout() {
  return request<{ status: string }>("/auth/session/current", { method: "DELETE" });
}

export function getFeed() {
  return request<{ status: string; items: FeedCharacter[] }>("/feed");
}

export function createConversation(characterId: string) {
  return request<{ status: string; conversation: Conversation }>("/conversations", {
    method: "POST",
    body: JSON.stringify({ character_id: characterId }),
  });
}

export function getConversationHistory(limit = 30) {
  return request<{ status: string; items: Conversation[] }>(
    `/conversations?limit=${limit}`,
  );
}

export function getConversation(conversationId: string) {
  return request<{
    status: string;
    conversation: Conversation;
    messages: ChatMessage[];
    models: ModelProfile[];
    wallet: Wallet | null;
    guest_quota?: GuestQuota | null;
    experience: CharacterExperience;
  }>(`/conversations/${conversationId}`);
}

export function updateModel(conversationId: string, modelProfile: ModelProfile["profile"]) {
  return request<{ status: string; conversation: Conversation }>(
    `/conversations/${conversationId}/model`,
    { method: "PATCH", body: JSON.stringify({ model_profile: modelProfile }) },
  );
}

export function restartConversation(conversationId: string) {
  return request<{
    status: string;
    conversation: Conversation;
    messages: ChatMessage[];
    wallet: Wallet;
    experience: CharacterExperience;
  }>(`/conversations/${conversationId}/restart`, { method: "POST" });
}

export function setCharacterLike(characterId: string, active: boolean) {
  return request<{ status: string; active: boolean; count: number }>(
    `/characters/${characterId}/like`,
    { method: active ? "PUT" : "DELETE" },
  );
}

export function setCharacterFavorite(characterId: string, active: boolean) {
  return request<{ status: string; active: boolean; count: number }>(
    `/characters/${characterId}/favorite`,
    { method: active ? "PUT" : "DELETE" },
  );
}

export function sendTurn(conversationId: string, text: string, requestId: string, guest = false) {
  return request<{
    status: string;
    reply: { message_id: string | null; text: string };
    charged_coins: number;
    wallet: Wallet | null;
    guest_quota?: GuestQuota;
    deduplicated: boolean;
  }>(`/conversations/${conversationId}/turns`, {
    method: "POST",
    body: JSON.stringify({
      client_message_id: requestId,
      idempotency_key: requestId,
      ...(guest ? { action: { kind: "message", text } } : { text }),
    }),
  });
}

export function cancelTurn(conversationId: string, requestId: string) {
  return request<{
    status: string;
    turn_id: string;
    cancel_requested: boolean;
    run_status: string;
    wallet: Wallet;
  }>(`/conversations/${conversationId}/turns/${encodeURIComponent(requestId)}/cancel`, {
    method: "POST",
  });
}

export async function sendTurnStream({
  conversationId,
  text,
  requestId,
  guest = false,
  signal,
  onEvent,
}: {
  conversationId: string;
  text: string;
  requestId: string;
  guest?: boolean;
  signal: AbortSignal;
  onEvent: (event: TurnStreamEvent) => void;
}): Promise<void> {
  const csrf = cookieValue("plum_csrf");
  const response = await fetch(`${BASE}/conversations/${conversationId}/turns/stream`, {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    signal,
    headers: {
      "Accept": "text/event-stream",
      "Content-Type": "application/json",
      ...(csrf ? { "X-Plum-CSRF": decodeURIComponent(csrf) } : {}),
    },
    body: JSON.stringify({
      client_message_id: requestId,
      idempotency_key: requestId,
      ...(guest ? { action: { kind: "message", text } } : { text }),
    }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { detail?: unknown };
    throw new ApiError(typeof payload.detail === "string" ? payload.detail : "request_failed", response.status);
  }
  if (!response.body) throw new StreamProtocolError("STREAM_TRUNCATED");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminalSeen = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const parsed = parseSseRecords(buffer);
      buffer = parsed.remainder;
      for (const record of parsed.records) {
        const event = toTurnStreamEvent(record);
        if (!event) continue;
        if (terminalSeen) throw new StreamProtocolError("STREAM_INVALID_EVENT");
        onEvent(event);
        if (["turn.completed", "turn.cancelled", "turn.failed"].includes(event.type)) terminalSeen = true;
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
  if (!terminalSeen || buffer.trim()) throw new StreamProtocolError("STREAM_TRUNCATED");
}
