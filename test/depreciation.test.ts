import { describe, expect, it } from "vitest";

import {
  ASSET_CLASSES,
  computeSchedule,
  deductionForYear,
  defaultConvention,
  firstYearFraction,
  midQuarterApplies,
  requireAssetClass,
  type Convention,
  type DepreciationMethod,
} from "@/lib/depreciation";

/**
 * These cases assert against the percentages published in IRS Pub. 946
 * (Tables A-1, A-2, A-5), not against this implementation. If the engine
 * drifts, these fail.
 */

// $1,000,000.00 in cents - large enough that a percentage resolves finely.
const BASIS = 100_000_000;

/** Run a schedule and return each year as a percentage of the depreciable basis. */
function percentages(
  assetClassId: string,
  method: DepreciationMethod,
  convention: Convention,
  placedInService: string,
): number[] {
  const schedule = computeSchedule({
    cost: BASIS,
    placedInService,
    assetClassId,
    method,
    convention,
  });
  return schedule.years.map((y) => (y.amount / BASIS) * 100);
}

/**
 * The published tables are rounded to 2-3 decimals and then nudged so each
 * column sums to exactly 100%, so an exact computation sits within about a
 * hundredth of a point of them - never further. That is the real claim, so
 * assert it directly rather than with a looser toBeCloseTo digit count.
 */
const TABLE_TOLERANCE = 0.01;

function expectTable(actual: number[], expected: number[]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, i) => {
    const difference = Math.abs(value - expected[i]!);
    expect(
      difference,
      `year ${i + 1}: computed ${value.toFixed(4)}%, table ${expected[i]}%`,
    ).toBeLessThanOrEqual(TABLE_TOLERANCE);
  });

  // The table's own column sums to 100%; so must ours, far more precisely.
  const total = actual.reduce((sum, v) => sum + v, 0);
  expect(total).toBeCloseTo(100, 6);
}

describe("IRS Table A-1 · half-year convention", () => {
  it("3-year, 200% DB", () => {
    expectTable(percentages("3", "200DB", "half-year", "2026-06-01"), [
      33.33, 44.45, 14.81, 7.41,
    ]);
  });

  it("5-year, 200% DB", () => {
    expectTable(percentages("5", "200DB", "half-year", "2026-06-01"), [
      20.0, 32.0, 19.2, 11.52, 11.52, 5.76,
    ]);
  });

  it("7-year, 200% DB — the class most farm machinery lands in", () => {
    expectTable(percentages("7", "200DB", "half-year", "2026-06-01"), [
      14.29, 24.49, 17.49, 12.49, 8.93, 8.92, 8.93, 4.46,
    ]);
  });

  it("10-year, 200% DB", () => {
    expectTable(percentages("10", "200DB", "half-year", "2026-06-01"), [
      10.0, 18.0, 14.4, 11.52, 9.22, 7.37, 6.55, 6.55, 6.56, 6.55, 3.28,
    ]);
  });

  it("15-year, 150% DB — land improvements", () => {
    expectTable(percentages("15", "150DB", "half-year", "2026-06-01"), [
      5.0, 9.5, 8.55, 7.7, 6.93, 6.23, 5.9, 5.9, 5.91, 5.9, 5.91, 5.9, 5.91, 5.9, 5.91, 2.95,
    ]);
  });

  it("20-year, 150% DB — general purpose farm buildings", () => {
    expectTable(percentages("20", "150DB", "half-year", "2026-06-01"), [
      3.75, 7.219, 6.677, 6.177, 5.713, 5.285, 4.888, 4.522, 4.462, 4.461, 4.462, 4.461, 4.462,
      4.461, 4.462, 4.461, 4.462, 4.461, 4.462, 4.461, 2.231,
    ]);
  });
});

describe("IRS Table A-2 · mid-quarter, first quarter", () => {
  it("5-year, 200% DB", () => {
    expectTable(percentages("5", "200DB", "mid-quarter", "2026-02-15"), [
      35.0, 26.0, 15.6, 11.01, 11.01, 1.38,
    ]);
  });

  it("7-year, 200% DB", () => {
    expectTable(percentages("7", "200DB", "mid-quarter", "2026-01-10"), [
      25.0, 21.43, 15.31, 10.93, 8.75, 8.74, 8.75, 1.09,
    ]);
  });
});

describe("IRS Table A-5 · mid-quarter, fourth quarter", () => {
  it("5-year, 200% DB", () => {
    expectTable(percentages("5", "200DB", "mid-quarter", "2026-11-20"), [
      5.0, 38.0, 22.8, 13.68, 10.94, 9.58,
    ]);
  });

  it("7-year, 200% DB", () => {
    expectTable(percentages("7", "200DB", "mid-quarter", "2026-12-31"), [
      3.57, 27.55, 19.68, 14.06, 10.04, 8.73, 8.73, 7.64,
    ]);
  });
});

describe("firstYearFraction", () => {
  it("is always half under the half-year convention", () => {
    expect(firstYearFraction("half-year", "2026-01-01")).toBe(0.5);
    expect(firstYearFraction("half-year", "2026-12-31")).toBe(0.5);
  });

  it("steps down by quarter under mid-quarter", () => {
    expect(firstYearFraction("mid-quarter", "2026-02-01")).toBeCloseTo(0.875);
    expect(firstYearFraction("mid-quarter", "2026-05-01")).toBeCloseTo(0.625);
    expect(firstYearFraction("mid-quarter", "2026-08-01")).toBeCloseTo(0.375);
    expect(firstYearFraction("mid-quarter", "2026-11-01")).toBeCloseTo(0.125);
  });

  it("steps down by month under mid-month", () => {
    expect(firstYearFraction("mid-month", "2026-01-15")).toBeCloseTo(11.5 / 12);
    expect(firstYearFraction("mid-month", "2026-07-15")).toBeCloseTo(5.5 / 12);
    expect(firstYearFraction("mid-month", "2026-12-15")).toBeCloseTo(0.5 / 12);
  });
});

describe("straight line and real property", () => {
  it("spreads 39-year property evenly with a mid-month stub", () => {
    const schedule = computeSchedule({
      cost: BASIS,
      placedInService: "2026-01-10",
      assetClassId: "39",
      method: "SL",
      convention: "mid-month",
    });

    // Year one: 11.5 of 12 months of a 1/39 annual amount.
    expect((schedule.years[0]!.amount / BASIS) * 100).toBeCloseTo((11.5 / 12 / 39) * 100, 3);
    // Middle years are a full 1/39.
    expect((schedule.years[5]!.amount / BASIS) * 100).toBeCloseTo((1 / 39) * 100, 3);
    // The recovery runs one year past the class life.
    expect(schedule.years).toHaveLength(40);
  });

  it("recovers 27.5-year residential rental across the stub year and 27 more", () => {
    const schedule = computeSchedule({
      cost: BASIS,
      placedInService: "2026-06-10",
      assetClassId: "27.5",
      method: "SL",
      convention: "mid-month",
    });
    // Placed in service mid-June: 6.5 of 12 months in year one, leaving
    // 27.5 - 0.5417 = 26.96 years, which needs 27 further rows.
    expect(schedule.years).toHaveLength(28);
    expect(schedule.years.at(-1)!.remaining).toBe(0);
  });
});

describe("every schedule recovers the basis exactly", () => {
  it("sums to the depreciable basis, to the cent, across all classes", () => {
    for (const assetClass of ASSET_CLASSES) {
      for (const convention of assetClass.realProperty
        ? (["mid-month"] as const)
        : (["half-year", "mid-quarter"] as const)) {
        for (const month of ["01", "05", "08", "11"]) {
          const schedule = computeSchedule({
            // An awkward basis, to shake out rounding.
            cost: 1_234_567,
            placedInService: `2026-${month}-15`,
            assetClassId: assetClass.id,
            method: assetClass.defaultMethod,
            convention,
          });
          const total = schedule.years.reduce((sum, y) => sum + y.amount, 0);
          expect(
            total,
            `${assetClass.id}-year ${convention} month ${month}`,
          ).toBe(schedule.depreciableBasis);
          // And every row is a whole number of cents.
          for (const y of schedule.years) expect(Number.isInteger(y.amount)).toBe(true);
        }
      }
    }
  });

  it("leaves nothing remaining at the end", () => {
    const schedule = computeSchedule({
      cost: 987_654_3,
      placedInService: "2026-03-01",
      assetClassId: "7",
      method: "200DB",
      convention: "half-year",
    });
    expect(schedule.years.at(-1)!.remaining).toBe(0);
    expect(schedule.years.at(-1)!.accumulated).toBe(schedule.depreciableBasis);
  });
});

describe("section 179, bonus, and business use", () => {
  it("takes section 179 off the basis before anything else", () => {
    const schedule = computeSchedule({
      cost: 100_000_00,
      placedInService: "2026-05-01",
      assetClassId: "7",
      method: "200DB",
      convention: "half-year",
      section179: 40_000_00,
    });
    expect(schedule.section179).toBe(40_000_00);
    expect(schedule.depreciableBasis).toBe(60_000_00);
    // First year of 7-year 200% DB, half-year: (2/7) x 0.5 of the basis.
    expect(schedule.years[0]!.amount).toBe(Math.round(60_000_00 * (2 / 7) * 0.5));
  });

  it("applies bonus to what is left after section 179", () => {
    const schedule = computeSchedule({
      cost: 100_000_00,
      placedInService: "2026-05-01",
      assetClassId: "7",
      method: "200DB",
      convention: "half-year",
      section179: 20_000_00,
      bonusPercent: 50,
    });
    expect(schedule.bonus).toBe(40_000_00); // 50% of the remaining 80,000
    expect(schedule.depreciableBasis).toBe(40_000_00);
  });

  it("writes the whole asset off when 179 covers the cost", () => {
    const schedule = computeSchedule({
      cost: 50_000_00,
      placedInService: "2026-05-01",
      assetClassId: "7",
      method: "200DB",
      convention: "half-year",
      section179: 50_000_00,
    });
    expect(schedule.depreciableBasis).toBe(0);
    expect(schedule.years).toHaveLength(0);
    expect(schedule.firstYearTotal).toBe(50_000_00);
  });

  it("caps section 179 at the business basis rather than going negative", () => {
    const schedule = computeSchedule({
      cost: 10_000_00,
      placedInService: "2026-05-01",
      assetClassId: "7",
      method: "200DB",
      convention: "half-year",
      section179: 99_999_00,
    });
    expect(schedule.section179).toBe(10_000_00);
    expect(schedule.depreciableBasis).toBe(0);
  });

  it("depreciates only the business-use share", () => {
    const schedule = computeSchedule({
      cost: 40_000_00,
      placedInService: "2026-05-01",
      assetClassId: "5",
      method: "200DB",
      convention: "half-year",
      businessUsePercent: 75,
    });
    expect(schedule.businessBasis).toBe(30_000_00);
    expect(schedule.depreciableBasis).toBe(30_000_00);
  });

  it("rejects impossible inputs", () => {
    const base = {
      cost: 10_000_00,
      placedInService: "2026-05-01",
      assetClassId: "7",
      method: "200DB" as const,
      convention: "half-year" as const,
    };
    expect(() => computeSchedule({ ...base, businessUsePercent: 0 })).toThrow();
    expect(() => computeSchedule({ ...base, businessUsePercent: 101 })).toThrow();
    expect(() => computeSchedule({ ...base, bonusPercent: -1 })).toThrow();
    expect(() => computeSchedule({ ...base, bonusPercent: 101 })).toThrow();
    expect(() => computeSchedule({ ...base, cost: -1 })).toThrow();
    expect(() => computeSchedule({ ...base, assetClassId: "42" })).toThrow();
  });
});

describe("deductionForYear", () => {
  const schedule = computeSchedule({
    cost: 100_000_00,
    placedInService: "2026-05-01",
    assetClassId: "7",
    method: "200DB",
    convention: "half-year",
    section179: 10_000_00,
    bonusPercent: 50,
  });

  it("adds 179 and bonus into the placed-in-service year only", () => {
    // 10,000 of 179 + 45,000 bonus + first-year MACRS on the remaining 45,000.
    expect(deductionForYear(schedule, 2026)).toBe(
      10_000_00 + 45_000_00 + schedule.years[0]!.amount,
    );
    expect(deductionForYear(schedule, 2027)).toBe(schedule.years[1]!.amount);
  });

  it("is zero outside the recovery period", () => {
    expect(deductionForYear(schedule, 2025)).toBe(0);
    expect(deductionForYear(schedule, 2099)).toBe(0);
  });
});

describe("midQuarterApplies", () => {
  const asset = (month: string, basis: number, realProperty = false) => ({
    placedInService: `2026-${month}-15`,
    basis,
    realProperty,
  });

  it("is false when Q4 additions are 40% or less", () => {
    expect(midQuarterApplies([asset("03", 60_000), asset("11", 40_000)])).toBe(false);
  });

  it("is true once Q4 additions exceed 40%", () => {
    expect(midQuarterApplies([asset("03", 50_000), asset("11", 50_000)])).toBe(true);
  });

  it("ignores real property, which uses mid-month regardless", () => {
    expect(midQuarterApplies([asset("03", 10_000), asset("11", 90_000, true)])).toBe(false);
  });

  it("is false with no assets", () => {
    expect(midQuarterApplies([])).toBe(false);
  });
});

describe("class metadata", () => {
  it("has unique ids and sane defaults", () => {
    const ids = ASSET_CLASSES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of ASSET_CLASSES) {
      expect(c.years).toBeGreaterThan(0);
      if (c.realProperty) expect(c.defaultMethod).toBe("SL");
    }
  });

  it("routes real property to mid-month and everything else to half-year", () => {
    expect(defaultConvention(requireAssetClass("39"))).toBe("mid-month");
    expect(defaultConvention(requireAssetClass("7"))).toBe("half-year");
    expect(defaultConvention(requireAssetClass("7"), true)).toBe("mid-quarter");
    // Real property stays mid-month even when mid-quarter was triggered.
    expect(defaultConvention(requireAssetClass("39"), true)).toBe("mid-month");
  });
});
