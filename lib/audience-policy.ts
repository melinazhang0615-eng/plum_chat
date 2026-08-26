import type { FeedGender } from "./api";
import type { GuestProfile } from "./types";

export const CURRENT_AGE_BANDS = ["35_plus", "25_34", "18_24", "14_17", "13_or_younger"] as const;
export const AUDIENCE_ONBOARDING_SEEN_KEY = "plum_audience_onboarding_seen";
export const AGE_NOT_ELIGIBLE_MESSAGE = "We're sorry, you are not eligible to use Plum.";
export const MATURE_CONTENT_NOT_ALLOWED_MESSAGE = "Mature content is only available to users aged 18 or older.";

type AudienceActorState = {
  kind: "visitor" | "guest" | "member";
  profile_complete: boolean;
};

/** Members follow persisted profile state; anonymous viewers are prompted only once per browser. */
export function shouldAutoOpenAudienceOnboarding(
  actor: AudienceActorState | null | undefined,
  hasSeen: boolean,
) {
  if (actor?.profile_complete) return false;
  if (actor?.kind === "member") return true;
  return !hasSeen;
}

/** Interpret both the current audience segments and accepted legacy profiles. */
export function profileAllowsMature(profile?: GuestProfile | null) {
  return Boolean(
    profile
    && ["35_plus", "25_34", "18_24", "above_26", "24_26", "21_23", "18_20"].includes(profile.age_band)
    && profile.age_declaration?.status === "accepted",
  );
}

/** Convert the saved onboarding preference into the feed's existing filter vocabulary. */
export function preferenceToFeedGender(preference?: GuestProfile["relationship_preference"]): FeedGender | null {
  if (preference === "male" || preference === "female" || preference === "non_binary") return preference;
  return null;
}
