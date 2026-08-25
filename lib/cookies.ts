/**
 * Cookie reads shared by the API client and the failure reporter.
 *
 * Its own module only to keep those two from importing each other: `api.ts` reports its
 * failures through `telemetry.ts`, and `telemetry.ts` needs the CSRF cookie to post them.
 */

export function cookieValue(name: string) {
  if (typeof document === "undefined") return "";
  const prefix = `${encodeURIComponent(name)}=`;
  return document.cookie.split("; ").find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? "";
}

/**
 * The double-submit header for a state-changing request. Empty when there is no cookie to
 * match — a visitor has no session yet, and the server treats that case as same-origin-only
 * rather than rejecting it.
 */
export function csrfHeader(): Record<string, string> {
  const csrf = cookieValue("plum_csrf");
  return csrf ? { "X-Plum-CSRF": decodeURIComponent(csrf) } : {};
}
