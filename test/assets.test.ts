import { beforeEach, describe, expect, it } from "vitest";

import {
  assetClassLabel,
  deductionFor,
  disposalFraction,
  remainingBasis,
  scheduleFor,
  summarizeYear,
} from "@/lib/assets";
import { Store } from "@/lib/db/store";
import type { Asset, NewAsset } from "@/lib/db/types";
import { buildReport } from "@/lib/report";

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 1,
    name: "Tractor",
    description: null,
    assetClassId: "7",
    method: "200DB",
    convention: "half-year",
    placedInService: "2026-05-01",
    cost: 100_000_00,
    section179: 0,
    bonusPercent: 0,
    businessUsePercent: 100,
    disposedDate: null,
    disposalProceeds: null,
    notes: null,
    createdBy: null,
    createdAt: "2026-05-01 00:00:00",
    updatedAt: "2026-05-01 00:00:00",
    ...overrides,
  };
}

describe("deductionFor", () => {
  it("gives the first-year MACRS amount in the year placed in service", () => {
    const a = asset();
    expect(deductionFor(a, 2026)).toBe(Math.round(100_000_00 * (2 / 7) * 0.5));
  });

  it("is zero before the asset existed and after recovery ends", () => {
    const a = asset();
    expect(deductionFor(a, 2025)).toBe(0);
    expect(deductionFor(a, 2040)).toBe(0);
  });

  it("adds section 179 and bonus only in the first year", () => {
    const a = asset({ section179: 30_000_00, bonusPercent: 50 });
    const schedule = scheduleFor(a);
    expect(deductionFor(a, 2026)).toBe(
      30_000_00 + schedule.bonus + schedule.years[0]!.amount,
    );
    expect(deductionFor(a, 2027)).toBe(schedule.years[1]!.amount);
  });

  it("halves the disposal year under the half-year convention and stops after", () => {
    const a = asset({ disposedDate: "2028-08-15" });
    const full = scheduleFor(a).years.find((y) => y.year === 2028)!.amount;
    expect(deductionFor(a, 2028)).toBe(Math.round(full * 0.5));
    expect(deductionFor(a, 2029)).toBe(0);
  });

  it("prorates the disposal year by quarter under mid-quarter", () => {
    const a = asset({ convention: "mid-quarter", disposedDate: "2028-02-01" });
    const full = scheduleFor(a).years.find((y) => y.year === 2028)!.amount;
    // Disposed in Q1: 0.5 of 4 quarters.
    expect(deductionFor(a, 2028)).toBe(Math.round(full * 0.125));
  });
});

describe("disposalFraction", () => {
  it("is half a year under the half-year convention", () => {
    expect(disposalFraction("half-year", "2028-01-01")).toBe(0.5);
    expect(disposalFraction("half-year", "2028-12-31")).toBe(0.5);
  });

  it("steps up by quarter and by month", () => {
    expect(disposalFraction("mid-quarter", "2028-02-01")).toBeCloseTo(0.125);
    expect(disposalFraction("mid-quarter", "2028-11-01")).toBeCloseTo(0.875);
    expect(disposalFraction("mid-month", "2028-01-20")).toBeCloseTo(0.5 / 12);
    expect(disposalFraction("mid-month", "2028-12-20")).toBeCloseTo(11.5 / 12);
  });
});

describe("summarizeYear", () => {
  const tractor = asset({ id: 1, name: "Tractor", cost: 100_000_00 });
  const truck = asset({
    id: 2,
    name: "Truck",
    assetClassId: "5",
    cost: 40_000_00,
    placedInService: "2026-03-01",
    section179: 10_000_00,
  });
  const tile = asset({
    id: 3,
    name: "Drainage tile",
    assetClassId: "15",
    method: "150DB",
    cost: 25_000_00,
    placedInService: "2024-06-01",
  });

  it("totals every asset's deduction for the year", () => {
    const summary = summarizeYear([tractor, truck, tile], 2026);
    const expected =
      deductionFor(tractor, 2026) + deductionFor(truck, 2026) + deductionFor(tile, 2026);
    expect(summary.total).toBe(expected);
    expect(summary.rows).toHaveLength(3);
  });

  it("splits section 179 and bonus out of the total", () => {
    const summary = summarizeYear([truck], 2026);
    expect(summary.section179).toBe(10_000_00);
    expect(summary.macrs).toBe(summary.total - summary.section179 - summary.bonus);
  });

  it("counts 179 only in the placed-in-service year", () => {
    expect(summarizeYear([truck], 2027).section179).toBe(0);
  });

  it("orders rows by size, largest first", () => {
    const summary = summarizeYear([tile, tractor, truck], 2026);
    const amounts = summary.rows.map((r) => r.deduction);
    expect([...amounts].sort((a, b) => b - a)).toEqual(amounts);
  });

  it("drops assets with nothing to claim", () => {
    const summary = summarizeYear([tractor], 2050);
    expect(summary.rows).toHaveLength(0);
    expect(summary.total).toBe(0);
  });
});

describe("remainingBasis", () => {
  it("falls as the asset is depreciated", () => {
    const a = asset();
    const atStart = remainingBasis([a], 2026);
    const later = remainingBasis([a], 2029);
    expect(atStart).toBeGreaterThan(later);
    expect(remainingBasis([a], 2040)).toBe(0);
  });

  it("excludes assets already disposed of", () => {
    const a = asset({ disposedDate: "2027-06-01" });
    expect(remainingBasis([a], 2028)).toBe(0);
  });
});

describe("report integration", () => {
  it("adds asset depreciation to line 14 and reports it separately", () => {
    const report = buildReport(2026, [{ categoryId: "feed", total: 1_000_00, count: 1 }], {
      assetDepreciation: 7_142_86,
    });
    const line14 = report.expenses.find((l) => l.line === "14")!;

    expect(line14.amount).toBe(7_142_86);
    expect(line14.note).toBe("From the asset schedule");
    expect(report.assetDepreciation).toBe(7_142_86);
    expect(report.totalExpenses).toBe(1_000_00 + 7_142_86);
  });

  it("sums the schedule with hand-entered depreciation and says so", () => {
    const report = buildReport(
      2026,
      [{ categoryId: "depreciation", total: 500_00, count: 1 }],
      { assetDepreciation: 1_000_00 },
    );
    const line14 = report.expenses.find((l) => l.line === "14")!;

    expect(line14.amount).toBe(1_500_00);
    expect(line14.note).toContain("plus entries recorded by hand");
  });

  it("leaves line 14 alone when there are no assets", () => {
    const report = buildReport(2026, [{ categoryId: "depreciation", total: 500_00, count: 1 }]);
    const line14 = report.expenses.find((l) => l.line === "14")!;
    expect(line14.amount).toBe(500_00);
    expect(line14.note).toBeUndefined();
    expect(report.assetDepreciation).toBe(0);
  });
});

describe("asset persistence", () => {
  let store: Store;
  beforeEach(() => {
    store = new Store(":memory:");
  });

  const input: NewAsset = {
    name: "John Deere 5075E",
    assetClassId: "7",
    method: "200DB",
    convention: "half-year",
    placedInService: "2026-04-10",
    cost: 4_500_000,
    section179: 1_000_000,
    bonusPercent: 40,
    businessUsePercent: 90,
    notes: "Bought at spring auction",
  };

  it("round-trips every field", () => {
    const created = store.createAsset(input);
    const read = store.getAsset(created.id)!;

    expect(read.name).toBe("John Deere 5075E");
    expect(read.cost).toBe(4_500_000);
    expect(read.section179).toBe(1_000_000);
    expect(read.bonusPercent).toBe(40);
    expect(read.businessUsePercent).toBe(90);
    expect(read.method).toBe("200DB");
    expect(read.convention).toBe("half-year");
    expect(read.disposedDate).toBeNull();
  });

  it("computes a schedule straight from a stored row", () => {
    const created = store.createAsset(input);
    const schedule = scheduleFor(created);
    // 90% business use of 45,000, less 10,000 of 179, less 40% bonus.
    expect(schedule.businessBasis).toBe(4_050_000);
    expect(schedule.section179).toBe(1_000_000);
    expect(schedule.bonus).toBe(Math.round(3_050_000 * 0.4));
  });

  it("updates and deletes", () => {
    const created = store.createAsset(input);
    const updated = store.updateAsset(created.id, { ...input, cost: 5_000_000 })!;
    expect(updated.cost).toBe(5_000_000);

    store.deleteAsset(created.id);
    expect(store.getAsset(created.id)).toBeUndefined();
  });

  it("finds the assets placed in service in a year", () => {
    store.createAsset(input);
    store.createAsset({ ...input, name: "Older", placedInService: "2024-01-05" });
    expect(store.assetsPlacedInYear(2026).map((a) => a.name)).toEqual(["John Deere 5075E"]);
  });

  it("rejects an out-of-range business use at the database boundary", () => {
    expect(() => store.createAsset({ ...input, businessUsePercent: 150 })).toThrow();
    expect(() => store.createAsset({ ...input, bonusPercent: -5 })).toThrow();
  });
});

describe("assetClassLabel", () => {
  it("names known classes and falls back for unknown ones", () => {
    expect(assetClassLabel(asset({ assetClassId: "7" }))).toBe("7-year property");
    expect(assetClassLabel(asset({ assetClassId: "99" }))).toBe("99-year property");
  });
});
