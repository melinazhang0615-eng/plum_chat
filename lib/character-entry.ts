import { ApiError } from "./api.ts";

export type CharacterEntryFailure =
  | "audience_setup_required"
  | "mature_content_denied"
  | "not_available"
  | "other";

/** Map backend access outcomes to the UI flow a direct character link needs. */
export function classifyCharacterEntryFailure(error: unknown): CharacterEntryFailure {
  if (!(error instanceof ApiError)) return "other";
  if ([
    "guest_profile_required",
    "audience_profile_required",
    "adult_confirmation_required",
  ].includes(error.message)) return "audience_setup_required";
  if (error.message === "mature_content_not_allowed") return "mature_content_denied";
  if (error.status === 404 || error.message === "character not found") return "not_available";
  return "other";
}
