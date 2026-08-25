// Extension included on purpose: a runtime (non-type) import needs it for the test runner's
// resolver, which is also why `./cookies.ts` and `./telemetry.ts` are spelled that way in api.ts.
import { ApiError } from "./api.ts";
import { AGE_NOT_ELIGIBLE_MESSAGE, MATURE_CONTENT_NOT_ALLOWED_MESSAGE } from "./audience-policy.ts";

/**
 * One sentence per backend error code, for every screen.
 *
 * Before this module each page carried its own dictionary of codes. The same refusal therefore
 * read differently depending on where the user hit it, a code one page knew was a shrug on
 * another ("something went wrong"), and adding a code on the backend meant remembering which
 * of three copies to edit. Sign-in copy was Chinese while the create flow was English, so the
 * language a user saw depended on which request happened to fail.
 *
 * Only codes whose meaning is independent of what the user was doing belong here. Anything
 * that needs to reference the action ("your draft is still saved") is copy the call site
 * passes to {@link errorMessage} instead.
 *
 * Deliberately absent: the 401 codes (`authentication_required`, `session_expired`). A 401 is
 * a flow decision — redirect, or open the sign-in dialog — and each screen keys that off the
 * status, so putting sentences here would override copy the call site chose on purpose.
 */
const CODE_MESSAGES: Record<string, string> = {
  // Transport. `ApiTimeoutError` is an `ApiError` subclass, so without this entry a timeout
  // used to fall through to whatever the call site's catch-all said — usually some variant of
  // "check your input", which blames the user for our unanswered request.
  request_timeout: "The server took too long to answer. Check your connection and try again.",
  rate_limited: "Too many requests. Wait a moment and try again.",

  // Email sign-in and identity.
  email_provider_unavailable: "Email delivery is unavailable right now. Try again shortly.",
  email_challenge_too_frequent: "That was too soon. Wait a moment before requesting another code.",
  email_auth_not_configured: "Email sign-in is not configured yet. Try again later.",
  email_auth_disabled: "Email sign-in is not available yet.",
  too_many_login_attempts: "Too many attempts. Wait a few minutes and try again.",
  origin_required: "Open Plum in a normal browser tab to continue.",
  email_code_invalid: "That code is not right. Check it and enter it again.",
  email_challenge_expired: "That code has expired. Request a new one.",
  email_challenge_attempts_exceeded: "Too many wrong codes. Request a new one.",
  email_challenge_invalid: "That code is no longer valid. Request a new one.",
  email_challenge_consumed: "That code has already been used. Request a new one.",
  email_challenge_actor_mismatch: "Your session changed while signing in. Request a new code.",
  identity_target_disabled: "This account is unavailable. Contact support.",
  identity_merge_conflict: "This account could not be linked. Contact support.",

  // Guest sessions.
  guest_chat_disabled: "Guest chat is not open yet.",
  guest_session_required: "Your session expired. Refresh the page and try again.",
  guest_sign_in_required: "You have used up the free messages. Sign in to keep going — your story is saved.",
  age_not_eligible: AGE_NOT_ELIGIBLE_MESSAGE,
  audience_profile_required: "Tell us your age before opening mature content.",
  mature_content_not_allowed: MATURE_CONTENT_NOT_ALLOWED_MESSAGE,

  // Chat turns.
  insufficient_coins: "Not enough coins for this message.",
  conversation_turn_active: "The previous reply is still being written. Give it a moment.",
  // The stream already retried once and the upstream is still failing, so telling the user to
  // "retry" again would just spend our provider quota on their behalf.
  turn_retry_exhausted: "This message keeps failing to send. Try again later.",

  // Portrait upload.
  media_too_large: "This image is too large. Choose a smaller file.",
  media_kind_unsupported: "Use a JPG, PNG, WebP, HEIC, or HEIF image.",
  media_decode_failed: "This image could not be read. Try exporting it again.",

  // Character creation.
  character_moderation_not_configured: "Character review is not available yet. Nothing was published, and your draft is still saved.",
  character_moderation_rejected: "The character was not approved. Nothing was created; review the content before trying again.",
  character_moderation_review_required: "Automatic review could not reach a decision. Nothing was created.",
  character_confirmation_required: "Both creator confirmations are required before creation.",
  character_tag_invalid: "One or more selected Tags are no longer available. Refresh the Tag list and try again.",
  creator_media_not_claimable: "This portrait can no longer be used. Upload it again before creating the character.",

  // Feed filters. These mean the client sent a value the API rejects, i.e. our bug — but the
  // user still needs a way out of the state they are stuck in.
  invalid_gender: "That filter is not available. Clear the filters and try again.",
  invalid_rating: "That filter is not available. Clear the filters and try again.",
  invalid_cursor: "This page of results expired. Reload to start from the top.",
};

export type ErrorCopy = {
  /**
   * Shown when the request never reached the API at all — offline, DNS, a refused connection.
   * Distinct from `fallback` because there is nothing about the user's input to reconsider.
   */
  offline?: string;
  /** Shown when the API answered with a code and status this screen has no sentence for. */
  fallback: string;
  /** Sentences for statuses this screen treats specially, most often 401, 409, 422, or 503. */
  byStatus?: Record<number, string>;
};

/**
 * The one sentence to show a user for a failed request.
 *
 * Resolution order is most-specific-first: a named code beats a status, because a code says
 * what happened while a status only says which family it belongs to. `byStatus` then covers
 * the statuses this screen assigns its own meaning to, and `fallback` catches the rest.
 */
export function errorMessage(error: unknown, copy: ErrorCopy): string {
  if (!(error instanceof ApiError)) return copy.offline ?? copy.fallback;
  const byCode = CODE_MESSAGES[error.message];
  if (byCode) return byCode;
  // status 0 means no response was ever received (see `ApiTimeoutError`), so it is a transport
  // failure wearing an `ApiError` costume rather than a decision the server made.
  if (error.status === 0) return copy.offline ?? copy.fallback;
  return copy.byStatus?.[error.status] ?? copy.fallback;
}

/**
 * The sentence for a bare code, for the one place a failure arrives as data rather than as a
 * thrown error: a `turn.failed` stream event carries its reason in `code`, so without this it
 * would land on the generic "could not be generated" no matter what the server said.
 */
export function messageForCode(code: string | undefined, fallback: string): string {
  return (code && CODE_MESSAGES[code]) || fallback;
}

/** Exported for the test that keeps this dictionary and the backend's codes in step. */
export const KNOWN_ERROR_CODES = Object.freeze(Object.keys(CODE_MESSAGES));
