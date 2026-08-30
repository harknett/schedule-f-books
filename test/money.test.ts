import { describe, expect, it } from "vitest";

import { formatAmount, formatUsd, parseAmount } from "@/lib/money";

describe("parseAmount", () => {
  it("reads plain and decorated amounts as cents", () => {
    expect(parseAmount("12")).toBe(1200);
    expect(parseAmount("12.34")).toBe(1234);
    expect(parseAmount("$1,234.56")).toBe(123456);
    expect(parseAmount("  0.05 ")).toBe(5);
  });

  it("pads a single decimal place", () => {
    expect(parseAmount("12.5")).toBe(1250);
  });

  it("avoids binary floating point error", () => {
    // 0.1 + 0.2 territory: these must be exact.
    expect(parseAmount("0.29")).toBe(29);
    expect(parseAmount("1.10")).toBe(110);
    expect(parseAmount("19.99")).toBe(1999);
    expect(parseAmount("1234567.89")).toBe(123456789);
  });

  it("handles negatives", () => {
    expect(parseAmount("-5.25")).toBe(-525);
  });

  it("rejects malformed input", () => {
    for (const bad of ["", "abc", "1.234", "1.2.3", "--5", ".", "-"]) {
      expect(() => parseAmount(bad), `expected "${bad}" to be rejected`).toThrow();
    }
  });
});

describe("formatting", () => {
  it("renders cents with separators", () => {
    expect(formatAmount(123456)).toBe("1,234.56");
    expect(formatAmount(5)).toBe("0.05");
    expect(formatAmount(0)).toBe("0.00");
    expect(formatAmount(-525)).toBe("-5.25");
  });

  it("renders dollars with the sign outside", () => {
    expect(formatUsd(123456)).toBe("$1,234.56");
    expect(formatUsd(-525)).toBe("-$5.25");
  });

  it("round-trips through parse", () => {
    for (const cents of [0, 5, 99, 100, 1999, 123456789]) {
      expect(parseAmount(formatAmount(cents))).toBe(cents);
    }
  });
});
