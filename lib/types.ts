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

export type GuestQuota = {
  used_turns: number;
  limit: number;
  remaining_turns: number;
  sign_in_required: boolean;
};

export type PlumCapabilities = {
  guest_chat: boolean;
  email_auth: boolean;
  google_auth: boolean;
  apple_auth?: boolean;
  chat_streaming: boolean;
};

export type AuthActor =
  | { kind: "visitor"; user: null; profile_complete: false }
  | { kind: "guest"; user: { id: string; display_name: null }; profile_complete: boolean; profile?: GuestProfile }
  | { kind: "member"; user: AuthUser; profile_complete: true };

export type AuthContext = {
  status: "ok";
  actor: AuthActor;
  capabilities: PlumCapabilities;
  guest_quota: GuestQuota | null;
  wallet: Wallet | null;
  session_expires_at: string | null;
};

export type ModelProfile = {
  profile: "fast" | "balanced" | "immersive";
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
  model_profile: ModelProfile["profile"] | "guest_free";
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
 * A long-term fact the user saved out of this conversation. Saving one from a chat
 * bubble records the source message so the same bubble is not saved twice.
 */
export type ConversationPin = {
  id: string;
  content: string;
  sort_order: number;
  message_id?: string | null;
  created_at?: string;
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
    pins: ConversationPin[];
  };
  inspiration_prompts: string[];
};
