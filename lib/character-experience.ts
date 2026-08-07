import type { FeedPresentation } from "./presentation";
import type { Character, CharacterExperience, PublicUserSummary } from "./types";

const mockUsers: Record<string, PublicUserSummary> = {
  creator: { id: "mock_creator_fibre", display_name: "fibre", avatar_ref: null },
  shyann: { id: "mock_user_shyann", display_name: "Shyann Villarreal", avatar_ref: null },
  elisha: { id: "mock_user_elisha", display_name: "Elisha O'Gara", avatar_ref: null },
  test: { id: "test_user", display_name: "测试用户", avatar_ref: null },
};

/**
 * Temporary backend-shaped fallback for visual acceptance. Business content
 * lives here instead of in React components so a future API response can
 * replace it without changing the page layout.
 */
export function buildMockCharacterExperience(
  presentation: FeedPresentation | undefined,
  character: Character,
): CharacterExperience {
  const creatorName = presentation?.creator.replace(/^@/, "") || mockUsers.creator.display_name;
  const creator: PublicUserSummary = {
    ...mockUsers.creator,
    id: `mock_creator_${creatorName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    display_name: creatorName,
  };

  return {
    profile: {
      creator,
      badges: [{ code: "featured", display_name: "Featured character", style_token: "featured" }],
      tags: ["OC", ...character.tags].slice(0, 5),
      stats: {
        interaction_count: presentation?.interactionCount ?? character.heat_count,
        connector_count: 12400,
        comment_count: 2154,
        memory_count: 18,
      },
      hot_comments: [
        {
          id: "mock_comment_shyann",
          author: mockUsers.shyann,
          content: "I love this one",
          source_locale: "en",
          like_count: 91,
          viewer_has_liked: false,
          created_at: "2026-02-13T12:00:00Z",
        },
        {
          id: "mock_comment_elisha",
          author: mockUsers.elisha,
          content: "The atmosphere feels so real. I'm already invested.",
          source_locale: "en",
          like_count: 63,
          viewer_has_liked: false,
          created_at: "2026-02-13T12:00:00Z",
        },
      ],
      memories: [
        { id: "mock_memory_first_met", title: "The night we first met", owner: mockUsers.test, message_count: 26, engagement_count: 61, published_at: "2026-02-10T12:00:00Z" },
        { id: "mock_memory_rain", title: "A promise in the rain", owner: mockUsers.test, message_count: 18, engagement_count: 12, published_at: "2026-02-11T12:00:00Z" },
        { id: "mock_memory_story", title: "The story so far", owner: mockUsers.test, message_count: 42, engagement_count: 5, published_at: "2026-02-12T12:00:00Z" },
      ],
    },
    viewer_state: {
      relationship_level: 0,
      relationship_xp: 0,
      current_chapter: 1,
      has_liked: false,
      like_count: 119,
      is_favorite: false,
      favorite_count: 120,
    },
    conversation_tools: {
      role_card: {
        id: "mock_role_card_test_user",
        display_name: mockUsers.test.display_name,
        avatar_ref: null,
        description: "定义“你”在故事中的身份与背景。",
      },
      pins: [],
    },
    inspiration_prompts: [
      "看着{{character}}的眼睛，问：“你刚才为什么没有说实话？”",
      "向前走近一步，轻声问：“如果今晚不用考虑后果，你最想做什么？”",
      "把话题拉回第一次见面：“你还记得当时对我的第一印象吗？”",
    ],
  };
}
