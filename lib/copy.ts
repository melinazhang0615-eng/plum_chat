import type { ChatMessage, GuestQuota, MessageStatus } from "./types";

/**
 * Copy that more than one screen shows.
 *
 * This is not an i18n layer and does not try to be one — it holds the strings that were
 * literally duplicated between the feed and the chat header, which is how the two wallet
 * panels ended up in different languages and different number locales. Page-local copy stays
 * inline where it reads best; the payoff of a module is for the strings that drift apart when
 * they live in two files.
 *
 * Product language is English: Plum's audience is overseas, and the create and studio flows
 * were already written that way.
 */

/** Icon-button labels in the site header, which the feed and the chat room both render. */
export const HEADER_LABELS = {
  search: "Search",
  create: "Create",
  language: "Change language",
  account: "Account",
  signIn: "Sign in",
  coinBalance: (balance: string) => `Coin balance: ${balance}`,
} as const;

export const LANGUAGE_MENU = {
  chinese: "简体中文",
  english: "English",
  note: "More languages coming soon",
} as const;

export const WALLET_PANEL = {
  balance: "Coin balance",
  history: "Transaction history",
  empty: "No transactions yet",
  topUp: "Top-up · coming soon",
} as const;

export const ACCOUNT_MENU = {
  studio: "My Studio",
  settings: "Account settings · coming soon",
  signOut: "Sign out",
} as const;

/**
 * Labels for chat-room controls that exist twice — once in the mobile layout, once in the
 * desktop one. Same reason as the header: two renderings of one control drift apart, and an
 * aria-label that drifts is invisible to everyone except the screen-reader user it misleads.
 */
export const CHAT_LABELS = {
  room: (characterName: string) => `Chat with ${characterName}`,
  back: "Back to characters",
  profile: (characterName: string) => `${characterName} profile`,
  showProfile: "Show character profile",
  closeProfile: "Close character profile",
  share: "Share character",
  more: "More options",
  settings: "Layout and settings",
  scrollLatest: "Back to the latest message",
  model: "Choose the chat model",
  pinned: "Pinned memories",
  inspiration: "Suggest something to say",
  stop: "Stop the reply",
  send: "Send message",
  openConversation: (characterName: string) => `Open the chat with ${characterName}`,
} as const;

export const GUEST_BANNER = {
  /** The reason to sign in, shown under the quota line. */
  savePrompt: "Sign in to save your progress",
  noQuota: "Free trial chat",
  exhausted: "Free messages used up",
} as const;

/**
 * How much free chat a guest has left.
 *
 * The numeric guard is not defensive padding: `guest_quota` used to be typed with four fields
 * the API never sends, so this label rendered "still undefined messages left" to every guest
 * while TypeScript reported no problem. A type is a claim about the wire, and this one was
 * wrong — so the label refuses to interpolate anything that is not actually a number.
 */
export function guestQuotaLabel(quota: GuestQuota | null): string {
  const remaining = quota?.typed_remaining;
  if (typeof remaining !== "number" || Number.isNaN(remaining)) return GUEST_BANNER.noQuota;
  if (remaining <= 0) return GUEST_BANNER.exhausted;
  return `${remaining} free ${remaining === 1 ? "message" : "messages"} left`;
}

const MESSAGE_STATUS_LABELS: Partial<Record<MessageStatus, string>> = {
  sending: "Sending…",
  streaming: "Replying…",
  cancelled: "Stopped",
};

/**
 * The line under a bubble while it is in flight. Returns null once the message has settled,
 * which is the caller's cue to show the timestamp instead.
 */
export function messageStatusLabel(status: MessageStatus, message: Pick<ChatMessage, "role">): string | null {
  if (status === "failed") return message.role === "user" ? "Not sent" : "Reply failed";
  return MESSAGE_STATUS_LABELS[status] ?? null;
}
