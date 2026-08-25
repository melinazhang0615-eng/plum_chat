export type Wallet = {
  balance: number;
  balance_micros: number;
  unit: string;
};

export type AuthUser = {
  id: string;
  display_name: string;
};

export type GuestProfile = {
  pronouns: "she_her" | "he_him" | "they_them" | "other";
  relationship_preference: "male" | "female" | "all" | "no_preference" | null;
  genres: string[];
};

/**
 * What a guest has left, as the API actually sends it (`get_guest_quota` in
 * `plum/infrastructure/guest_repository.py`): two remaining counts, no totals and no flag.
 *
 * `typed` is a message the guest wrote; `continue` is tapping the character's continuation
 * button. They are separate budgets, so a guest can run out of one and still have the other.
 */
export type GuestQuota = {
  typed_remaining: number;
  continue_remaining: number;
};

export type PlumCapabilities = {
  guest_chat: boolean;
  email_auth: boolean;
  google_auth: boolean;
  apple_auth?: boolean;
  chat_streaming: boolean;
  /**
   * Whether this viewer may open the Debug Console. The backend decides (dev environment
   * or beta allowlist) so that opening it for one account in production is a config
   * change, not a frontend release. Optional while older backends are still deployed.
   */
  debug_console?: boolean;
};

export type AuthActor =
  | { kind: "visitor"; user: null; profile_complete: false }
  | { kind: "guest"; user: { id: string; display_name: null }; profile_complete: boolean; profile?: GuestProfile }
  | { kind: "member"; user: AuthUser; profile_complete: true };

/** Where a stored value came from, in the backend's own precedence order. */
export type PreferenceSource = "explicit" | "client_initial" | "product_default";

/**
 * The server's view of this actor's language and timezone.
 *
 * `timezone` is here so the client can tell whether the browser's zone still needs to be
 * sent: the server has no way to derive it (see `lib/timezone.ts`), and re-sending an
 * unchanged value on every page load would be a write per visit. The timezone fields are
 * optional because a backend without the daily-memory columns simply omits them.
 */
export type PlumLanguageContext = {
  catalog_version: string;
  language_key: string;
  locale: string;
  ui_locale: string;
  preference_revision: number | null;
  source: string;
  timezone?: string;
  timezone_source?: PreferenceSource;
};

export type AuthContext = {
  status: "ok";
  actor: AuthActor;
  capabilities: PlumCapabilities;
  language?: PlumLanguageContext;
  guest_quota: GuestQuota | null;
  wallet: Wallet | null;
  session_expires_at: string | null;
};

export type ModelProfile = {
  profile: string;
  tier_label: "Free" | "Standard" | "Premium" | string;
  display_name: string;
  description: string;
  coin_cost: number;
  coin_cost_micros: number;
  is_default: boolean;
  config_version: number;
};

export type Character = {
  id: string;
  display_name: string;
  tagline: string;
  intro: string;
  greeting: string;
  tags: string[];
  heat_count: number;
  avatar_ref: string | null;
  cover_ref: string | null;
  accent_color: string;
  prompt_version: number;
  content_rating: string;
  capabilities: { text: boolean; voice: boolean };
};

export type FeedCharacter = Character & {
  creator: {
    id: string;
    handle: string;
    display_name: string;
    avatar_ref: string | null;
  } | null;
  badges: Array<{
    code: string;
    display_name: string;
    icon_ref: string | null;
    style_token: string;
  }>;
  interaction_count: number;
  stats: {
    interaction_count: number;
    connector_count: number;
    comment_count: number;
    memory_count: number;
    like_count: number;
    favorite_count: number;
  };
};

export type Conversation = {
  id: string;
  character_id: string;
  model_profile: string;
  runtime_session_id: number;
  updated_at?: string;
  character: Character;
};

export type MessageStatus =
  | "sending"
  | "streaming"
  | "completed"
  | "cancelled"
  | "failed";

export type ChatMessage = {
  id: number | string;
  message_id?: string | null;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  status?: MessageStatus;
  /** @deprecated Kept while older API payloads and cached UI state are migrated. */
  pending?: boolean;
  /** @deprecated Kept while older API payloads and cached UI state are migrated. */
  failed?: boolean;
};

export type PublicUserSummary = {
  id: string;
  display_name: string;
  avatar_ref: string | null;
};

export type CharacterProfileComment = {
  id: string;
  author: PublicUserSummary;
  content: string;
  source_locale: string;
  like_count: number;
  viewer_has_liked: boolean;
  created_at: string;
};

export type CharacterPublicMemory = {
  id: string;
  title: string;
  owner: PublicUserSummary;
  message_count: number;
  engagement_count: number;
  published_at: string;
};

/**
 * Backend contract for the Plum product-domain data surrounding a character.
 * Messages, model execution and wallet data remain shared runtime concerns.
 */
export type CharacterExperience = {
  profile: {
    creator: PublicUserSummary;
    badges: Array<{ code: string; display_name: string; style_token: string }>;
    tags: string[];
    stats: {
      interaction_count: number;
      connector_count: number;
      comment_count: number;
      memory_count: number;
    };
    hot_comments: CharacterProfileComment[];
    memories: CharacterPublicMemory[];
  };
  viewer_state: {
    relationship_level: number;
    relationship_xp: number;
    current_chapter: number;
    has_liked: boolean;
    like_count: number;
    is_favorite: boolean;
    favorite_count: number;
  };
  conversation_tools: {
    role_card: {
      id: string;
      display_name: string;
      avatar_ref: string | null;
      description: string;
    } | null;
    pins: Array<{ id: string; content: string; sort_order: number }>;
  };
  inspiration_prompts: string[];
};

/**
 * Debug Console payloads.
 *
 * These mirror rows the backend dumps for diagnosis, so the shapes stay deliberately open:
 * a new column on `plum_connections` should show up in the console without a frontend
 * release. Only the fields the page actually reasons about are named.
 */
export type DebugRecord = Record<string, unknown>;

/** The exact request handed to the provider for one attempt. */
export type DebugPrompt = {
  system_prompt: string;
  messages: Array<{ role: string; content: string }>;
  response_format: DebugRecord;
  request_meta: DebugRecord;
  captured_at: string;
  expires_at: string;
  rendered_request_hash: string;
  /** True when the stored text still hashes to what the snapshot recorded at dispatch. */
  hash_matches: boolean;
};

export type DebugSnapshot = DebugRecord & {
  id: string;
  attempt: number;
  request_ordinal: number;
  status: string;
  prompt: DebugPrompt | null;
  block_manifest: DebugRecord | null;
  cast: DebugRecord[];
};

export type DebugTurnDetail = {
  turn: DebugRecord & { id: string; status: string; attempt: number };
  ownership: DebugRecord | null;
  conversation: DebugRecord | null;
  snapshots: DebugSnapshot[];
  segments: DebugRecord[];
  billing: DebugRecord;
};

export type DebugTurnSummary = {
  id: string;
  status: string;
  attempt: number;
  provider_id: string | null;
  model_ref: string | null;
  finish_reason: string | null;
  error_code: string | null;
  created_at: string;
  completed_at: string | null;
  snapshot_count: number;
  prompt_count: number;
  has_prompt: boolean;
};

export type DebugConversationOverview = {
  conversation: DebugRecord;
  connection: DebugRecord | null;
  scenario: DebugRecord | null;
  cast_revision: DebugRecord | null;
  cast_members: DebugRecord[];
  relationship_states: DebugRecord[];
  conversation_state: DebugRecord | null;
  present_cast: DebugRecord[];
  model_profile: DebugRecord | null;
  language_preference: DebugRecord | null;
};
