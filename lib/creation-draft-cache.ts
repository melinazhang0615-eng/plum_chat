export const LEGACY_CREATION_DRAFT_STORAGE_KEY = "plum.create.v1.single-character";

/** Keep browser-only Creation drafts isolated by member and server Work. */
export function creationDraftStorageKey(userId: string, workId = "") {
  const owner = encodeURIComponent(userId.trim());
  const scope = workId.trim() ? `work.${encodeURIComponent(workId.trim())}` : "new";
  return `plum.create.v2.${owner}.${scope}`;
}
