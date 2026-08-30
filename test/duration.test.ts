import { describe, expect, it } from "vitest";

import { formatDuration, formatHours, parseDuration } from "@/lib/duration";

describe("parseDuration", () => {
  it("reads a bare number as hours", () => {
    expect(parseDuration("2")).toBe(120);
    expect(parseDuration("2.5")).toBe(150);
    expect(parseDuration("0.25")).toBe(15);
  });

  it("reads hour/minute notation", () => {
    expect(parseDuration("2h")).toBe(120);
    expect(parseDuration("2h30m")).toBe(150);
    expect(parseDuration("2h 30m")).toBe(150);
    expect(parseDuration("2h30")).toBe(150);
  });

  it("reads clock notation", () => {
    expect(parseDuration("2:30")).toBe(150);
    expect(parseDuration("0:45")).toBe(45);
  });

  it("reads explicit minutes", () => {
    expect(parseDuration("90m")).toBe(90);
    expect(parseDuration("45m")).toBe(45);
  });

  it("rounds to whole minutes", () => {
    expect(parseDuration("1.333")).toBe(80);
  });

  it("rejects zero, junk, and impossible days", () => {
    for (const bad of ["", "0", "abc", "-2", "2 hours", "25"]) {
      expect(() => parseDuration(bad), `expected "${bad}" to be rejected`).toThrow();
    }
  });

  it("allows exactly 24 hours", () => {
    expect(parseDuration("24")).toBe(1440);
  });
});

describe("formatting", () => {
  it("renders human durations", () => {
    expect(formatDuration(150)).toBe("2h 30m");
    expect(formatDuration(120)).toBe("2h");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(0)).toBe("0m");
  });

  it("renders decimal hours for timesheets", () => {
    expect(formatHours(150)).toBe("2.50");
    expect(formatHours(90)).toBe("1.50");
    expect(formatHours(20)).toBe("0.33");
  });
});
