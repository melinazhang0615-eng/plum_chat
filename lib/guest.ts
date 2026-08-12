// Guest onboarding prototype state (front-end mock; localStorage only).
// Real guest sessions / OAuth will replace this once the backend contract lands.

export type GuestProfile = {
  pronoun: "She/Her" | "He/Him" | "They/Them";
  ageBand: "Above 26" | "24-26" | "21-23" | "18-20" | "14-17" | "0-13";
  preference: "Male" | "Female" | "Non-binary" | null;
  // Reserved for future personalization. Kept out of the Welcome UI on purpose:
  // in a browse-first product the taste signal comes from behavior (which cards a
  // guest opens), not a declared genre-select screen. Populate server-side later.
  genres?: string[];
  createdAt: string;
};

export type MockAuth = { provider: "google" | "apple" | "email"; email: string; name: string; signedInAt: string };

// Real OAuth returns the account email + given_name — characters address the user by that
// name, so there is no separate "what should we call you?" step. These mock identities stand
// in until the OAuth integration lands; then `name`/`email` come from the provider.
const MOCK_IDENTITY: Record<MockAuth["provider"], { email: string; name: string }> = {
  google: { email: "alex.rivera@gmail.com", name: "Alex" },
  apple: { email: "jordan.lee@icloud.com", name: "Jordan" },
  email: { email: "sam@plum.chat", name: "Sam" },
};

/** First-login welcome coins. Placeholder amount — final value TBD by product. */
export const SIGNIN_REWARD_COINS = 1000;

export const GUEST_LIMITS = {
  continues: 8, // global "keep tapping" budget across all characters
  perCharacterContinues: 2, // each character always grants at least this many segments
  typed: 2, // typed replies before the gate (3rd attempt triggers it)
  nudgeAtContinue: 4, // story-internal "Answer me" after this many continues
};

const PROFILE_KEY = "plum_guest_profile";
const QUOTA_KEY = "plum_guest_quota";
const AUTH_KEY = "plum_mock_auth";
const NUDGE_KEY = "plum_guest_nudged";

const canStore = () => typeof window !== "undefined";

function readJson<T>(key: string): T | null {
  if (!canStore()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (!canStore()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — prototype ignores */
  }
}

export function getGuestProfile(): GuestProfile | null {
  return readJson<GuestProfile>(PROFILE_KEY);
}

export function saveGuestProfile(profile: Omit<GuestProfile, "createdAt">) {
  writeJson(PROFILE_KEY, { ...profile, createdAt: new Date().toISOString() });
}

export function getMockAuth(): MockAuth | null {
  return readJson<MockAuth>(AUTH_KEY);
}

/** Name characters use to address the user. Members → login identity; guests → none yet. */
export function getUserName(): string | null {
  return getMockAuth()?.name ?? null;
}

// Identity model (three states):
//  - "guest"  : no auth. Onboarding (Welcome) shown once; server-less, localStorage-backed.
//  - "member" : signed in. Never re-onboarded. New vs returning is a server distinction
//               (returning members get their profile from the server, not from this device),
//               so a member on a fresh device must NOT be re-shown Welcome.
export type Identity = "guest" | "member";
export function getIdentity(): Identity {
  return getMockAuth() ? "member" : "guest";
}

export function mockSignIn(provider: MockAuth["provider"]) {
  const id = MOCK_IDENTITY[provider];
  writeJson(AUTH_KEY, { provider, email: id.email, name: id.name, signedInAt: new Date().toISOString() });
  writeJson(REWARD_KEY, true); // first-login coin reward becomes pending
}

export function mockSignOut() {
  if (!canStore()) return;
  window.localStorage.removeItem(AUTH_KEY);
  window.localStorage.removeItem(REWARD_KEY);
}

const REWARD_KEY = "plum_reward_pending";
export function hasPendingReward(): boolean {
  return readJson<boolean>(REWARD_KEY) ?? false;
}
export function clearPendingReward() {
  if (canStore()) window.localStorage.removeItem(REWARD_KEY);
}

export type GuestQuota = { continues: number; typed: number; perChar: Record<string, { continues: number }> };

export function getGuestQuota(): GuestQuota {
  const raw = readJson<Partial<GuestQuota>>(QUOTA_KEY);
  return { continues: raw?.continues ?? 0, typed: raw?.typed ?? 0, perChar: raw?.perChar ?? {} };
}

export function bumpGuestQuota(kind: "continues" | "typed", characterId?: string): GuestQuota {
  const next = getGuestQuota();
  next[kind] += 1;
  if (kind === "continues" && characterId) {
    const entry = next.perChar[characterId] ?? { continues: 0 };
    next.perChar[characterId] = { continues: entry.continues + 1 };
  }
  writeJson(QUOTA_KEY, next);
  return next;
}

/** Global budget spent → still allow characters that haven't had their guaranteed segments yet. */
export function canGuestContinue(characterId: string): boolean {
  const quota = getGuestQuota();
  if (quota.continues < GUEST_LIMITS.continues) return true;
  return (quota.perChar[characterId]?.continues ?? 0) < GUEST_LIMITS.perCharacterContinues;
}

export function wasNudged(): boolean {
  return readJson<boolean>(NUDGE_KEY) ?? false;
}

export function markNudged() {
  writeJson(NUDGE_KEY, true);
}

const VIEWS_KEY = "plum_guest_views";

/**
 * Behavioral taste signal for guests: which character cards they opened, newest first.
 * This is the browse-first replacement for a genre-select screen — no UI, just a log
 * the recommender/merge can consume later. Capped so localStorage stays small.
 */
export function recordCharacterView(characterId: string) {
  if (!canStore() || !characterId) return;
  const prev = readJson<string[]>(VIEWS_KEY) ?? [];
  const next = [characterId, ...prev.filter((id) => id !== characterId)].slice(0, 40);
  writeJson(VIEWS_KEY, next);
}

export function getCharacterViews(): string[] {
  return readJson<string[]>(VIEWS_KEY) ?? [];
}

/** Demo helper: `?guest=reset` clears everything so the flow can be replayed. */
export function resetGuestState() {
  if (!canStore()) return;
  [PROFILE_KEY, QUOTA_KEY, AUTH_KEY, NUDGE_KEY, VIEWS_KEY, REWARD_KEY].forEach((key) => window.localStorage.removeItem(key));
}
