import { beforeEach, describe, expect, it } from "vitest";

import { Store } from "@/lib/db/store";
import { timeEntryKey } from "@/lib/import";
import {
  ALL_WEEKDAYS,
  MAX_RANGE_DAYS,
  addDays,
  datesBetween,
  describeWeekdays,
  weekdayOf,
  type Weekday,
} from "@/lib/dates";

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("handles a leap year", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
  });

  it("steps one calendar day across the spring clock change", () => {
    // US DST begins 8 March 2026. Adding 24 hours of milliseconds here would
    // land back on the 8th; adding a calendar day must not.
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
  });

  it("steps one calendar day across the autumn clock change", () => {
    // US DST ends 1 November 2026.
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
  });
});

describe("weekdayOf", () => {
  it("numbers Sunday as 0, matching getDay", () => {
    // 30 August 2026 is a Sunday.
    expect(weekdayOf("2026-08-30")).toBe(0);
    expect(weekdayOf("2026-08-31")).toBe(1);
    expect(weekdayOf("2026-09-05")).toBe(6);
  });
});

describe("datesBetween", () => {
  it("includes both ends", () => {
    expect(datesBetween("2026-08-01", "2026-08-03")).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
    ]);
  });

  it("gives a single day for a range of one", () => {
    expect(datesBetween("2026-08-01", "2026-08-01")).toEqual(["2026-08-01"]);
  });

  it("keeps only the chosen weekdays", () => {
    // 3 August 2026 is a Monday.
    const mondaysAndWednesdays = datesBetween("2026-08-01", "2026-08-31", [1, 3]);
    expect(mondaysAndWednesdays).toEqual([
      "2026-08-03", "2026-08-05",
      "2026-08-10", "2026-08-12",
      "2026-08-17", "2026-08-19",
      "2026-08-24", "2026-08-26",
      "2026-08-31",
    ]);
    expect(mondaysAndWednesdays.every((d) => [1, 3].includes(weekdayOf(d)))).toBe(true);
  });

  it("counts a full month correctly", () => {
    expect(datesBetween("2026-08-01", "2026-08-31")).toHaveLength(31);
    expect(datesBetween("2026-02-01", "2026-02-28")).toHaveLength(28);
    expect(datesBetween("2028-02-01", "2028-02-29")).toHaveLength(29);
  });

  it("does not skip or repeat a day across the clock changes", () => {
    const spring = datesBetween("2026-03-01", "2026-03-31");
    expect(spring).toHaveLength(31);
    expect(new Set(spring).size).toBe(31);
    expect(spring).toContain("2026-03-08");

    const autumn = datesBetween("2026-10-25", "2026-11-05");
    expect(autumn).toHaveLength(12);
    expect(new Set(autumn).size).toBe(12);
    expect(autumn).toContain("2026-11-01");
  });

  it("can select a single weekday, such as market day", () => {
    const saturdays = datesBetween("2026-08-01", "2026-08-31", [6]);
    expect(saturdays).toEqual(["2026-08-01", "2026-08-08", "2026-08-15", "2026-08-22", "2026-08-29"]);
  });

  it("returns nothing when no chosen weekday falls in the range", () => {
    // 3 to 5 August 2026 is Monday to Wednesday; asking for Sunday finds none.
    expect(datesBetween("2026-08-03", "2026-08-05", [0])).toEqual([]);
  });

  it("refuses a backwards range, an unreal date, and no weekdays", () => {
    expect(() => datesBetween("2026-08-31", "2026-08-01")).toThrow(/on or before/);
    expect(() => datesBetween("2026-02-30", "2026-03-01")).toThrow(/real dates/);
    expect(() => datesBetween("2026-08-01", "2026-08-31", [])).toThrow(/at least one day/);
  });

  it("refuses a range long enough to be a typo", () => {
    // A mistyped year should say so rather than produce a thousand rows.
    expect(() => datesBetween("2026-08-01", "2036-08-01")).toThrow(/more than 400 days/);
  });

  it("allows a genuine year-long catch-up", () => {
    expect(datesBetween("2026-01-01", "2026-12-31")).toHaveLength(365);
    expect(MAX_RANGE_DAYS).toBeGreaterThan(365);
  });
});

describe("describeWeekdays", () => {
  it("names the common shapes plainly", () => {
    expect(describeWeekdays(ALL_WEEKDAYS)).toBe("every day");
    expect(describeWeekdays([1, 2, 3, 4, 5])).toBe("weekdays");
    expect(describeWeekdays([0, 6])).toBe("weekends");
  });

  it("lists an arbitrary selection", () => {
    expect(describeWeekdays([6])).toBe("Sats");
    expect(describeWeekdays([1, 3])).toBe("Mon and Wed");
    expect(describeWeekdays([1, 3, 5])).toBe("Mon, Wed and Fri");
  });

  it("ignores the order it was given them in", () => {
    expect(describeWeekdays([5, 1, 3] as Weekday[])).toBe("Mon, Wed and Fri");
  });

  it("says so when nothing is chosen", () => {
    expect(describeWeekdays([])).toBe("no days");
  });
});

/**
 * The catch-up path as the action runs it: expand the range, drop days that
 * already carry the identical entry, write the rest in one transaction.
 */
describe("catching up on a range", () => {
  let store: Store;
  let userId: number;

  beforeEach(() => {
    store = new Store(":memory:");
    userId = store.createUser({
      email: "farmer@farm.test",
      name: "Sam Rivers",
      passwordHash: "x",
      role: "owner",
    }).id;
  });

  /** Mirrors logTime's range branch. */
  function catchUp(
    from: string,
    to: string,
    task: string,
    minutes: number,
    weekdays: Weekday[] = ALL_WEEKDAYS,
  ) {
    const dates = datesBetween(from, to, weekdays);
    const existing = new Set(
      store.listTimeEntriesInRange(dates[0]!, dates.at(-1)!, userId).map(timeEntryKey),
    );
    const toWrite = dates.filter((date) => !existing.has(timeEntryKey({ date, minutes, task })));

    store.transaction(() => {
      for (const date of toWrite) {
        store.createTimeEntry({ userId, date, minutes, task, notes: null });
      }
    });
    return { written: toWrite.length, skipped: dates.length - toWrite.length };
  }

  it("writes one entry per day in the range", () => {
    const result = catchUp("2026-08-01", "2026-08-14", "Livestock chores", 90);
    expect(result.written).toBe(14);
    expect(store.listTimeEntries(userId)).toHaveLength(14);
    expect(store.totalMinutes(userId, 2026)).toBe(14 * 90);
  });

  it("writes only the chosen weekdays", () => {
    const result = catchUp("2026-08-01", "2026-08-31", "Market", 300, [6]);
    expect(result.written).toBe(5); // five Saturdays in August 2026
    expect(store.listTimeEntries(userId).every((e) => weekdayOf(e.date) === 6)).toBe(true);
  });

  it("does not double the hours when the same catch-up runs twice", () => {
    catchUp("2026-08-01", "2026-08-14", "Livestock chores", 90);
    const second = catchUp("2026-08-01", "2026-08-14", "Livestock chores", 90);

    expect(second.written).toBe(0);
    expect(second.skipped).toBe(14);
    expect(store.listTimeEntries(userId)).toHaveLength(14);
    expect(store.totalMinutes(userId, 2026)).toBe(14 * 90);
  });

  it("fills only the gaps when the range is extended", () => {
    catchUp("2026-08-01", "2026-08-07", "Livestock chores", 90);
    const extended = catchUp("2026-08-01", "2026-08-14", "Livestock chores", 90);

    expect(extended.written).toBe(7);
    expect(extended.skipped).toBe(7);
    expect(store.listTimeEntries(userId)).toHaveLength(14);
  });

  it("treats a different duration as a different entry, not a duplicate", () => {
    catchUp("2026-08-01", "2026-08-03", "Livestock chores", 90);
    const longer = catchUp("2026-08-01", "2026-08-03", "Livestock chores", 120);

    // A second, longer stint on the same days is a real record, not a repeat.
    expect(longer.written).toBe(3);
    expect(store.listTimeEntries(userId)).toHaveLength(6);
  });

  it("treats a different task on the same day as a different entry", () => {
    catchUp("2026-08-01", "2026-08-03", "Fencing", 90);
    const other = catchUp("2026-08-01", "2026-08-03", "Harvest", 90);
    expect(other.written).toBe(3);
    expect(store.listTimeEntries(userId)).toHaveLength(6);
  });

  it("leaves other people's hours out of the comparison", () => {
    const other = store.createUser({
      email: "other@farm.test", name: "Pat", passwordHash: "x", role: "member",
    });
    store.createTimeEntry({
      userId: other.id, date: "2026-08-01", minutes: 90, task: "Livestock chores", notes: null,
    });

    // Pat having logged it must not stop Sam logging their own.
    const result = catchUp("2026-08-01", "2026-08-03", "Livestock chores", 90);
    expect(result.written).toBe(3);
    expect(store.listTimeEntries(userId)).toHaveLength(3);
    expect(store.listTimeEntries(other.id)).toHaveLength(1);
  });

  it("rolls up into the year's totals and the task breakdown", () => {
    catchUp("2026-08-01", "2026-08-31", "Livestock chores", 60, [1, 2, 3, 4, 5]);
    catchUp("2026-08-01", "2026-08-31", "Market", 300, [6]);

    const byTask = store.minutesByTask(userId, 2026);
    expect(byTask.find((t) => t.task === "Market")!.minutes).toBe(5 * 300);
    // 21 weekdays in August 2026.
    expect(byTask.find((t) => t.task === "Livestock chores")!.minutes).toBe(21 * 60);
  });
});
