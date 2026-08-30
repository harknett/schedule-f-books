/** Time worked is stored as whole minutes. */

const MAX_MINUTES_PER_ENTRY = 24 * 60;

/**
 * Parse the ways someone actually types a duration in a field:
 * "2.5", "2.5h", "2h 30m", "2:30", "90m", "90".
 * A bare number is read as hours, which is what a decimal entry means to most
 * people ("1.5" is an hour and a half, not ninety seconds' worth of minutes).
 */
export function parseDuration(input: string): number {
  const s = input.trim().toLowerCase().replace(/\s+/g, "");
  if (s === "") throw new Error("Time worked is required.");

  let minutes: number | null = null;

  const clock = /^(\d{1,2}):([0-5]\d)$/.exec(s);
  const hoursAndMinutes = /^(\d+(?:\.\d+)?)h(?:(\d{1,2})m?)?$/.exec(s);
  const minutesOnly = /^(\d+(?:\.\d+)?)m$/.exec(s);
  const bare = /^\d+(?:\.\d+)?$/.exec(s);

  if (clock) {
    minutes = Number(clock[1]) * 60 + Number(clock[2]);
  } else if (hoursAndMinutes) {
    minutes = Number(hoursAndMinutes[1]) * 60 + Number(hoursAndMinutes[2] ?? 0);
  } else if (minutesOnly) {
    minutes = Number(minutesOnly[1]);
  } else if (bare) {
    minutes = Number(bare[0]) * 60;
  }

  if (minutes == null) {
    throw new Error(`"${input}" isn't a time I understand. Try 2.5, 2h 30m, 2:30, or 90m.`);
  }

  minutes = Math.round(minutes);
  if (minutes <= 0) throw new Error("Time worked must be more than zero.");
  if (minutes > MAX_MINUTES_PER_ENTRY) {
    throw new Error("A single entry can't exceed 24 hours. Split it across days.");
  }
  return minutes;
}

/** 150 -> "2h 30m", 120 -> "2h", 45 -> "45m" */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** 150 -> "2.50" - the decimal form used on timesheets and tax worksheets. */
export function formatHours(minutes: number): string {
  return (minutes / 60).toFixed(2);
}
