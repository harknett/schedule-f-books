/**
 * Bridges stored assets to the depreciation engine, and rolls a year's assets
 * up into the figure that belongs on Schedule F line 14.
 */

import type { Asset } from "./db/types";
import {
  computeSchedule,
  getAssetClass,
  type Convention,
  type DepreciationSchedule,
} from "./depreciation";
import type { Cents } from "./money";

export function scheduleFor(asset: Asset): DepreciationSchedule {
  return computeSchedule({
    cost: asset.cost,
    placedInService: asset.placedInService,
    assetClassId: asset.assetClassId,
    method: asset.method,
    convention: asset.convention,
    section179: asset.section179,
    bonusPercent: asset.bonusPercent,
    businessUsePercent: asset.businessUsePercent,
  });
}

/**
 * The share of the year's depreciation allowed in the year an asset leaves the
 * farm. The same convention that governed the first year governs the last.
 */
export function disposalFraction(convention: Convention, disposedDate: string): number {
  if (convention === "half-year") return 0.5;
  const month = Number(disposedDate.slice(5, 7));
  if (convention === "mid-quarter") {
    const quarter = Math.floor((month - 1) / 3); // 0..3
    return (quarter + 0.5) / 4;
  }
  return (month - 0.5) / 12;
}

/**
 * What one asset contributes to a given tax year, with section 179 and bonus
 * counted in the year it was placed in service and disposal handled.
 */
export function deductionFor(asset: Asset, year: number): Cents {
  const disposalYear = asset.disposedDate ? Number(asset.disposedDate.slice(0, 4)) : null;
  if (disposalYear != null && year > disposalYear) return 0;

  const schedule = scheduleFor(asset);
  const placedYear = Number(asset.placedInService.slice(0, 4));
  if (year < placedYear) return 0;

  const row = schedule.years.find((y) => y.year === year);
  let annual = row?.amount ?? 0;

  // Partial year out, under the asset's own convention.
  if (disposalYear === year && asset.disposedDate) {
    annual = Math.round(annual * disposalFraction(asset.convention, asset.disposedDate));
  }

  const upFront = year === placedYear ? schedule.firstYearWriteOff : 0;
  return annual + upFront;
}

export interface AssetYearRow {
  asset: Asset;
  schedule: DepreciationSchedule;
  deduction: Cents;
  /** True in the year the asset was bought, when 179 and bonus land. */
  placedThisYear: boolean;
  disposedThisYear: boolean;
}

export interface AssetYearSummary {
  year: number;
  rows: AssetYearRow[];
  /** Sum of every asset's deduction - what belongs on line 14. */
  total: Cents;
  section179: Cents;
  bonus: Cents;
  /** Ordinary MACRS, excluding 179 and bonus. */
  macrs: Cents;
}

/** Roll every asset up into one year's depreciation deduction. */
export function summarizeYear(assets: Asset[], year: number): AssetYearSummary {
  const rows: AssetYearRow[] = [];
  let total = 0;
  let section179 = 0;
  let bonus = 0;

  for (const asset of assets) {
    const deduction = deductionFor(asset, year);
    const placedYear = Number(asset.placedInService.slice(0, 4));
    const disposalYear = asset.disposedDate ? Number(asset.disposedDate.slice(0, 4)) : null;
    const schedule = scheduleFor(asset);

    if (deduction === 0 && placedYear !== year && disposalYear !== year) continue;

    if (placedYear === year) {
      section179 += schedule.section179;
      bonus += schedule.bonus;
    }
    total += deduction;
    rows.push({
      asset,
      schedule,
      deduction,
      placedThisYear: placedYear === year,
      disposedThisYear: disposalYear === year,
    });
  }

  rows.sort((a, b) => b.deduction - a.deduction);

  return { year, rows, total, section179, bonus, macrs: total - section179 - bonus };
}

/** Cost basis still unrecovered across every asset still owned. */
export function remainingBasis(assets: Asset[], asOfYear: number): Cents {
  let remaining = 0;
  for (const asset of assets) {
    if (asset.disposedDate && Number(asset.disposedDate.slice(0, 4)) <= asOfYear) continue;
    const schedule = scheduleFor(asset);
    const lastRecovered = schedule.years.filter((y) => y.year <= asOfYear).at(-1);
    remaining += lastRecovered ? lastRecovered.remaining : schedule.depreciableBasis;
  }
  return remaining;
}

/** Human label for an asset's class, falling back to the stored id. */
export function assetClassLabel(asset: Asset): string {
  return getAssetClass(asset.assetClassId)?.label ?? `${asset.assetClassId}-year property`;
}
