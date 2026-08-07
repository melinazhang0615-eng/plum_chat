export type Wallet = {
  balance: number;
  balance_micros: number;
  unit: string;
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
};

export type Conversation = {
  id: string;
  character_id: string;
  model_profile: ModelProfile["profile"];
  runtime_session_id: number;
  character: Character;
};

export type ChatMessage = {
  id: number | string;
  message_id?: string | null;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  pending?: boolean;
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
 * Target contract for the Fibre product-domain data surrounding a character.
 * The current UI uses a typed local fallback with this shape; the backend can
 * later return the same contract without changing the component structure.
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
