import type { PlumLanguageContext } from "./types";

/**
 * The IANA timezone the browser is actually running in — the one thing about the reader's
 * clock the server cannot work out on its own. `Accept-Language` carries a language, not a
 * zone; `User-Agent` says nothing; an IP address gives a location that a VPN or a flight
 * invalidates, and only after adding a GeoIP dependency the backend does not have.
 *
 * Plum's daily memory job groups a day's messages by the *user's* local date, so without
 * this value everyone is batched in UTC and the day boundary lands mid-morning for readers
 * in East Asia, cutting a single conversation in half.
 *
 * Returns "" when the runtime cannot answer, which the caller treats as "send nothing".
 */
export function detectClientTimezone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof zone !== "string") return "";
    const name = zone.trim();
    // A UTC offset ("GMT+8", "UTC+08:00") cannot express daylight saving, so a day boundary
    // derived from one drifts by an hour twice a year. Older runtimes hand one back instead
    // of a zone name; the server rejects those, so do not spend a request on them.
    if (!name || name.startsWith("GMT") || /[+-]/.test(name)) return "";
    return name;
  } catch {
    return "";
  }
}

/**
 * Whether `detected` is worth sending to the server.
 *
 * Skipped when the reader picked a zone themselves (`explicit` outranks a browser reading —
 * one trip abroad should not silently rewrite a chosen setting), and when the server already
 * holds this exact browser-supplied value.
 */
export function timezoneNeedsSubmit(
  language: PlumLanguageContext | undefined,
  detected: string,
): boolean {
  if (!detected) return false;
  // No timezone fields at all means a backend that cannot store one yet.
  if (!language || language.timezone_source === undefined) return false;
  if (language.timezone_source === "explicit") return false;
  return !(language.timezone_source === "client_initial" && language.timezone === detected);
}
