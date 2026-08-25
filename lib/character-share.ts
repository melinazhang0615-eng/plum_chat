export type CharacterShareResult = "shared" | "copied" | "dismissed";

export function characterShareUrl(origin: string, characterId: string) {
  return `${origin}/chat/${encodeURIComponent(characterId)}`;
}

export async function shareCharacter(input: {
  characterId: string;
  title: string;
  text: string;
}): Promise<CharacterShareResult> {
  const url = characterShareUrl(window.location.origin, input.characterId);
  try {
    if (navigator.share) {
      await navigator.share({ title: input.title, text: input.text, url });
      return "shared";
    }
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return "dismissed";
    throw error;
  }
}
