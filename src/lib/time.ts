/** All dates are shown and typed in Philippine time (Asia/Manila, UTC+8, no daylight saving). */
export const TZ = "Asia/Manila";

/** ISO time -> value for <input type="datetime-local"> in Manila time. */
export function toManilaInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 8 * 3600_000);
  return d.toISOString().slice(0, 16);
}

/** "2026-11-25T17:00" typed in Manila -> ISO with +08:00. Empty -> null. */
export function fromManilaInput(v: string | null | undefined) {
  if (!v) return null;
  const s = v.length === 10 ? `${v}T17:00` : v;
  return `${s}:00+08:00`;
}

/** Start and end of "today" in Manila, as ISO strings. */
export function manilaDayBounds(offsetDays = 0) {
  const now = new Date(Date.now() + 8 * 3600_000);
  const day = now.toISOString().slice(0, 10);
  const start = new Date(`${day}T00:00:00+08:00`).getTime() + offsetDays * 86400_000;
  return { start: new Date(start).toISOString(), end: new Date(start + 86400_000).toISOString() };
}

export function manilaWeekEnd() {
  const now = new Date(Date.now() + 8 * 3600_000);
  const dow = now.getUTCDay(); // 0 = Sunday
  const toSunday = (7 - dow) % 7;
  return manilaDayBounds(toSunday).end;
}
