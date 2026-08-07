import type { CharacterExperience, ChatMessage, Conversation, FeedCharacter, ModelProfile, Wallet } from "./types";

const BASE = "/api/v1/products/fibre";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof payload.detail === "string" ? payload.detail : "request_failed";
    throw new Error(detail);
  }
  return payload as T;
}

export function getBootstrap() {
  return request<{ status: string; wallet: Wallet; models: ModelProfile[] }>("/bootstrap");
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

export function getConversation(conversationId: string) {
  return request<{
    status: string;
    conversation: Conversation;
    messages: ChatMessage[];
    models: ModelProfile[];
    wallet: Wallet;
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

export function sendTurn(conversationId: string, text: string, requestId: string) {
  return request<{
    status: string;
    reply: { message_id: string | null; text: string };
    charged_coins: number;
    wallet: Wallet;
    deduplicated: boolean;
  }>(`/conversations/${conversationId}/turns`, {
    method: "POST",
    body: JSON.stringify({
      text,
      client_message_id: requestId,
      idempotency_key: requestId,
    }),
  });
}
