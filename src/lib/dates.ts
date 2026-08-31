/** All dates in the app are local-time YYYY-MM-DD strings. */

export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function today(): string {
  return formatDate(new Date());
}

export function currentYear(): number {
  return new Date().getFullYear();
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function requireIsoDate(value: string, field = "Date"): string {
  const trimmed = value.trim();
  if (!isIsoDate(trimmed)) throw new Error(`${field} must be a real date in YYYY-MM-DD form.`);
  return trimmed;
}

export function yearBounds(year: number): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

/** "2026-08-30" -> "Aug 30, 2026" */
export function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Move an ISO date by whole days.
 *
 * Goes through a local Date rather than adding milliseconds, so a day either
 * side of the clocks changing is still one day.
 */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return formatDate(dt);
}

/** "2026-08-30" -> "Aug 30" (year omitted; for lists within one year) */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** 0 is Sunday, matching JavaScript's getDay(). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

export const ALL_WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

/**
 * A ceiling on how many days one entry can expand into.
 *
 * Rather more than a year, so a genuine catch-up is never refused, but low
 * enough that a mistyped year produces a message instead of a thousand rows.
 */
export const MAX_RANGE_DAYS = 400;

export function weekdayOf(isoDate: string): Weekday {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d).getDay() as Weekday;
}

/**
 * Every date from `from` to `to` inclusive, keeping only the given weekdays.
 *
 * Walks with addDays rather than adding milliseconds, so the clocks going
 * forward or back does not skip or repeat a day.
 */
export function datesBetween(
  from: string,
  to: string,
  weekdays: Iterable<Weekday> = ALL_WEEKDAYS,
): string[] {
  if (!isIsoDate(from) || !isIsoDate(to)) throw new Error("Both dates must be real dates.");
  if (from > to) throw new Error("The first day must be on or before the last.");

  const wanted = new Set(weekdays);
  if (wanted.size === 0) throw new Error("Choose at least one day of the week.");

  const dates: string[] = [];
  let cursor = from;
  for (let guard = 0; cursor <= to; guard++) {
    if (guard > MAX_RANGE_DAYS) {
      throw new Error(
        `That range covers more than ${MAX_RANGE_DAYS} days. Check the dates, or log it in parts.`,
      );
    }
    if (wanted.has(weekdayOf(cursor))) dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

/** "every day", "Mondays and Wednesdays", "Sat" - for describing a selection. */
export function describeWeekdays(weekdays: Iterable<Weekday>): string {
  const chosen = ALL_WEEKDAYS.filter((d) => new Set(weekdays).has(d));
  if (chosen.length === 7) return "every day";
  if (chosen.length === 0) return "no days";
  if (chosen.length === 5 && !chosen.includes(0) && !chosen.includes(6)) return "weekdays";
  if (chosen.length === 2 && chosen.includes(0) && chosen.includes(6)) return "weekends";

  const names = chosen.map((d) => WEEKDAY_LABELS[d]);
  if (names.length === 1) return `${names[0]}s`;
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
