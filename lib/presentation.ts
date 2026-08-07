export type FeedPresentation = {
  id: string;
  characterId: "char_luna" | "char_kai";
  cover: string;
  name: string;
  tagline: string;
  creator: string;
  interactionCount: number;
  hasVoice?: boolean;
  badge?: string;
};

/**
 * Visual-acceptance fixtures only. The image files may stay client-hosted while
 * validating the UI, but names, copy, creator, badges and counts are product
 * data and should eventually come from the Fibre feed API.
 */
export const feedPresentations: FeedPresentation[] = [
  {
    id: "after-hours",
    characterId: "char_kai",
    cover: "/characters/tipsy-reference/feed-01.avif",
    name: "Kai · After Hours",
    tagline: "He said the studio was closed. Then he left the door open for you.",
    creator: "@fibre",
    interactionCount: 48200,
    hasVoice: true,
    badge: "Editor’s Pick",
  },
  {
    id: "dangerous-promise",
    characterId: "char_kai",
    cover: "/characters/tipsy-reference/feed-02.avif",
    name: "The Dangerous Promise",
    tagline: "Your enemy knows every secret you swore you would take to the grave.",
    creator: "@nightfall",
    interactionCount: 31400,
  },
  {
    id: "no-rules",
    characterId: "char_kai",
    cover: "/characters/tipsy-reference/feed-03.avif",
    name: "No Rules Tonight",
    tagline: "The city’s most feared fighter only listens when you say his name.",
    creator: "@fibre",
    interactionCount: 26800,
    hasVoice: true,
  },
  {
    id: "cold-ceo",
    characterId: "char_kai",
    cover: "/characters/tipsy-reference/feed-04.avif",
    name: "Adrian Vale",
    tagline: "A contract, one penthouse, and the man who never takes no for an answer.",
    creator: "@velvetink",
    interactionCount: 19700,
  },
  {
    id: "mafia-twins",
    characterId: "char_kai",
    cover: "/characters/tipsy-reference/feed-05.avif",
    name: "The Romano Twins",
    tagline: "What’s the matter, pretty girl? Can’t handle the both of us?",
    creator: "@fibre",
    interactionCount: 72600,
    badge: "Trending",
  },
  {
    id: "red-room",
    characterId: "char_kai",
    cover: "/characters/tipsy-reference/feed-06.avif",
    name: "Lucien",
    tagline: "The bet started as a joke. Falling for you was never part of it.",
    creator: "@aurora",
    interactionCount: 35100,
    hasVoice: true,
  },
  {
    id: "the-boss",
    characterId: "char_kai",
    cover: "/characters/tipsy-reference/feed-07.avif",
    name: "Roman Morozov",
    tagline: "Mercy is a myth—and your only escape is through his obsession.",
    creator: "@fibre",
    interactionCount: 18900,
  },
  {
    id: "starlit-vow",
    characterId: "char_luna",
    cover: "/characters/tipsy-reference/feed-08.avif",
    name: "Luna · Starlit Vow",
    tagline: "You came for the view. She came to finally tell you the truth.",
    creator: "@moonlit",
    interactionCount: 42000,
    badge: "New",
  },
  {
    id: "midnight-escape",
    characterId: "char_luna",
    cover: "/characters/tipsy-reference/feed-09.avif",
    name: "A Midnight Escape",
    tagline: "He carried you out of the party. The real danger was waiting at home.",
    creator: "@fibre",
    interactionCount: 15300,
  },
  {
    id: "private-lesson",
    characterId: "char_kai",
    cover: "/characters/tipsy-reference/feed-10.avif",
    name: "Private Lessons",
    tagline: "Your new tutor has one rule: never look away when he is speaking.",
    creator: "@nightfall",
    interactionCount: 12800,
    hasVoice: true,
  },
];

export const chatCoverByCharacter: Record<string, string> = {
  char_luna: "/characters/tipsy-reference/feed-08.avif",
  char_kai: "/characters/tipsy-reference/feed-04.avif",
};

export function getPresentation(id: string | null) {
  return feedPresentations.find((item) => item.id === id);
}

export function formatCompactCount(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
