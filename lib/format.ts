/**
 * A coin balance, grouped for reading. One helper because the two wallet panels called
 * `toLocaleString` with two different locales — and one of them used both in the same panel,
 * so the header pill and the row under it could disagree about how to write the same number.
 */
export function formatCoins(balance: number) {
  return balance.toLocaleString("en-US");
}

export function formatCompactCount(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * The offset the API's *naive* timestamps are written in.
 *
 * Plum's backend stores times as plain `YYYY-MM-DD HH:MM:SS` text produced by
 * `to_char(now() AT TIME ZONE 'Asia/Shanghai', ...)`, and only some endpoints run that text
 * through its `_api_timestamp()` helper, which appends `+08:00` to make it a real ISO string.
 * So the same field can arrive in either shape, and the bare shape carries no offset at all —
 * `new Date("2026-08-15 09:30:00")` is interpreted in the *reader's* zone, which silently shifts
 * every message by however far the reader is from Beijing. Plum's audience is overseas, so that
 * is not a rounding error, it is the wrong time on every bubble.
 *
 * This constant is therefore a fact about the wire format, not a display preference: it says
 * "when the server omits the offset, it meant +08:00". The rendered output below still uses the
 * reader's own timezone.
 */
const NAIVE_TIMESTAMP_OFFSET = "+08:00";

/**
 * Wall-clock time for a chat bubble, in the reader's timezone. Returns "Just now" for anything
 * missing or unparseable — a timestamp is decoration next to the message itself, so a bad value
 * should never render "Invalid Date" or throw inside the message list.
 */
export function formatMessageTime(value?: string) {
  if (!value) return "Just now";
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + NAIVE_TIMESTAMP_OFFSET;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}
