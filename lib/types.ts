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
