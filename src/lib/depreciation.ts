/**
 * MACRS depreciation for farm assets.
 *
 * Implements the General Depreciation System: declining balance with an
 * automatic switch to straight line in the year straight line gives the larger
 * deduction, under the half-year, mid-quarter, or mid-month convention.
 *
 * The schedules this produces reproduce the IRS optional tables (Pub. 946
 * Tables A-1, A-2, A-5) exactly - see test/depreciation.test.ts, which asserts
 * against the published percentages rather than against this implementation.
 *
 * What it deliberately does NOT do, because these change and depend on the
 * whole return: enforce the section 179 dollar limit or its phase-out, pick a
 * bonus percentage for you, apply the business-income limitation, or handle
 * listed-property recapture. Those are inputs you supply and verify.
 */

import type { Cents } from "./money";

export type DepreciationMethod = "200DB" | "150DB" | "SL";
export type Convention = "half-year" | "mid-quarter" | "mid-month";

export interface AssetClass {
  /** Stable key stored on the asset. */
  id: string;
  /** GDS recovery period in years. */
  years: number;
  label: string;
  /** What the IRS defaults this class to under GDS. */
  defaultMethod: DepreciationMethod;
  /** Real property uses mid-month; everything else half-year or mid-quarter. */
  realProperty: boolean;
  examples: string;
}

/**
 * GDS recovery periods for the property a farm actually owns.
 *
 * 3/5/7/10-year farm property may use 200% declining balance for property
 * placed in service after 2017; before that, farming businesses were held to
 * 150%. Both are offered, defaulting to 200%. 15- and 20-year property uses
 * 150% for every taxpayer.
 */
export const ASSET_CLASSES: AssetClass[] = [
  {
    id: "3",
    years: 3,
    label: "3-year property",
    defaultMethod: "200DB",
    realProperty: false,
    examples: "Breeding hogs; over-the-road tractor units.",
  },
  {
    id: "5",
    years: 5,
    label: "5-year property",
    defaultMethod: "200DB",
    realProperty: false,
    examples:
      "Cars and light trucks; computers; breeding and dairy cattle; breeding sheep and goats.",
  },
  {
    id: "7",
    years: 7,
    label: "7-year property",
    defaultMethod: "200DB",
    realProperty: false,
    examples: "Most farm machinery and equipment; grain bins; office furniture.",
  },
  {
    id: "10",
    years: 10,
    label: "10-year property",
    defaultMethod: "200DB",
    realProperty: false,
    examples:
      "Single-purpose agricultural or horticultural structures; fruit- or nut-bearing trees and vines.",
  },
  {
    id: "15",
    years: 15,
    label: "15-year property",
    defaultMethod: "150DB",
    realProperty: false,
    examples: "Land improvements: drainage tile, fences, wells, paved lots.",
  },
  {
    id: "20",
    years: 20,
    label: "20-year property",
    defaultMethod: "150DB",
    realProperty: false,
    examples: "General purpose farm buildings, such as machine sheds and barns.",
  },
  {
    id: "27.5",
    years: 27.5,
    label: "27.5-year residential rental",
    defaultMethod: "SL",
    realProperty: true,
    examples: "A farmhouse or cottage rented to a tenant.",
  },
  {
    id: "39",
    years: 39,
    label: "39-year nonresidential real property",
    defaultMethod: "SL",
    realProperty: true,
    examples: "A farm office or retail building.",
  },
];

const CLASS_BY_ID = new Map(ASSET_CLASSES.map((c) => [c.id, c]));

export function getAssetClass(id: string): AssetClass | undefined {
  return CLASS_BY_ID.get(id);
}

export function requireAssetClass(id: string): AssetClass {
  const found = CLASS_BY_ID.get(id);
  if (!found) throw new Error(`Unknown asset class: "${id}".`);
  return found;
}

export const METHOD_LABELS: Record<DepreciationMethod, string> = {
  "200DB": "200% declining balance",
  "150DB": "150% declining balance",
  SL: "Straight line",
};

export const CONVENTION_LABELS: Record<Convention, string> = {
  "half-year": "Half-year",
  "mid-quarter": "Mid-quarter",
  "mid-month": "Mid-month",
};

/**
 * The share of a full year's depreciation allowed in the first year.
 *
 *   half-year   always 0.5
 *   mid-quarter 0.875 / 0.625 / 0.375 / 0.125 for Q1..Q4
 *   mid-month   (12 - month + 0.5) / 12
 */
export function firstYearFraction(convention: Convention, placedInService: string): number {
  if (convention === "half-year") return 0.5;

  const month = Number(placedInService.slice(5, 7));
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Placed-in-service date is not a real date: "${placedInService}".`);
  }

  if (convention === "mid-quarter") {
    const quarter = Math.floor((month - 1) / 3); // 0..3
    return (4 - quarter - 0.5) / 4;
  }
  return (12 - month + 0.5) / 12;
}

/** Which convention applies by default, given the class and whether mid-quarter was triggered. */
export function defaultConvention(assetClass: AssetClass, midQuarter = false): Convention {
  if (assetClass.realProperty) return "mid-month";
  return midQuarter ? "mid-quarter" : "half-year";
}

export interface ScheduleYear {
  /** Calendar year. */
  year: number;
  /** 1-based position in the recovery period. */
  ordinal: number;
  /** Share of the depreciable basis taken this year, as a fraction. */
  rate: number;
  amount: Cents;
  accumulated: Cents;
  /** Basis still to be recovered after this year. */
  remaining: Cents;
  /** Which computation won this year - declining balance, or the switch to straight line. */
  basisOf: "DB" | "SL";
}

export interface DepreciationInput {
  cost: Cents;
  placedInService: string;
  assetClassId: string;
  method: DepreciationMethod;
  convention: Convention;
  /** Section 179 expense elected, in cents. Comes off basis first. */
  section179?: Cents;
  /** Bonus depreciation percentage applied to basis after section 179, 0-100. */
  bonusPercent?: number;
  /** Business-use percentage, 0-100. Personal use is not depreciable. */
  businessUsePercent?: number;
}

export interface DepreciationSchedule {
  /** Cost reduced to the business-use share. */
  businessBasis: Cents;
  section179: Cents;
  bonus: Cents;
  /** What the yearly schedule recovers, after 179 and bonus. */
  depreciableBasis: Cents;
  /** 179 + bonus, both taken in year one. */
  firstYearWriteOff: Cents;
  years: ScheduleYear[];
  /** Everything recovered in the first calendar year, including 179 and bonus. */
  firstYearTotal: Cents;
}

/**
 * Build the full year-by-year schedule.
 *
 * Cents are integers throughout: each year is rounded to the nearest cent and
 * the final year absorbs the rounding drift, so the schedule always recovers
 * the basis exactly.
 */
export function computeSchedule(input: DepreciationInput): DepreciationSchedule {
  const assetClass = requireAssetClass(input.assetClassId);
  const years = assetClass.years;

  if (input.cost < 0) throw new Error("Cost cannot be negative.");

  const businessUse = input.businessUsePercent ?? 100;
  if (businessUse <= 0 || businessUse > 100) {
    throw new Error("Business use must be greater than 0 and at most 100 percent.");
  }

  const businessBasis = Math.round(input.cost * (businessUse / 100));

  const section179 = Math.min(Math.max(input.section179 ?? 0, 0), businessBasis);
  const afterSection179 = businessBasis - section179;

  const bonusPercent = input.bonusPercent ?? 0;
  if (bonusPercent < 0 || bonusPercent > 100) {
    throw new Error("Bonus depreciation must be between 0 and 100 percent.");
  }
  const bonus = Math.round(afterSection179 * (bonusPercent / 100));

  const depreciableBasis = afterSection179 - bonus;
  const startYear = Number(input.placedInService.slice(0, 4));
  const fraction = firstYearFraction(input.convention, input.placedInService);

  const schedule: ScheduleYear[] = [];

  if (depreciableBasis > 0) {
    // Declining-balance rate. Straight line has no DB component.
    const multiplier = input.method === "200DB" ? 2 : input.method === "150DB" ? 1.5 : 0;
    const dbRate = multiplier / years;

    let remaining = depreciableBasis;
    const lastOrdinal = Math.ceil(years) + 1;

    for (let ordinal = 1; ordinal <= lastOrdinal && remaining > 0; ordinal++) {
      // Recovery life left at the start of this year. Year one is the stub
      // period; from year two the remaining life carries the unused fraction.
      const remainingLife = ordinal === 1 ? years : years - ordinal + 2 - fraction;

      let amount: number;
      let basisOf: "DB" | "SL";

      if (input.method === "SL") {
        amount = (depreciableBasis / years) * (ordinal === 1 ? fraction : 1);
        basisOf = "SL";
      } else if (ordinal === 1) {
        amount = depreciableBasis * dbRate * fraction;
        basisOf = "DB";
      } else {
        const decliningBalance = remaining * dbRate;
        const straightLine = remaining / remainingLife;
        // Switch to straight line the year it yields more - and stay there,
        // which happens naturally because SL keeps winning once it wins.
        basisOf = straightLine > decliningBalance ? "SL" : "DB";
        amount = Math.max(decliningBalance, straightLine);
      }

      let cents = Math.round(amount);
      const isFinal = ordinal === lastOrdinal;
      // Never take more than is left; let the last year absorb rounding.
      if (isFinal || cents > remaining) cents = remaining;

      remaining -= cents;
      schedule.push({
        year: startYear + ordinal - 1,
        ordinal,
        rate: depreciableBasis === 0 ? 0 : cents / depreciableBasis,
        amount: cents,
        accumulated: depreciableBasis - remaining,
        remaining,
        basisOf,
      });
    }
  }

  const firstYearWriteOff = section179 + bonus;
  const firstYearTotal = firstYearWriteOff + (schedule[0]?.amount ?? 0);

  return {
    businessBasis,
    section179,
    bonus,
    depreciableBasis,
    firstYearWriteOff,
    years: schedule,
    firstYearTotal,
  };
}

/**
 * Depreciation deductible in one calendar year, including section 179 and
 * bonus in the year the asset was placed in service.
 */
export function deductionForYear(schedule: DepreciationSchedule, year: number): Cents {
  const row = schedule.years.find((y) => y.year === year);
  const annual = row?.amount ?? 0;
  const placedInServiceYear = schedule.years[0]?.year;
  const upFront = year === placedInServiceYear ? schedule.firstYearWriteOff : 0;
  return annual + upFront;
}

/**
 * Mid-quarter is mandatory when more than 40% of the year's non-real-property
 * additions, by depreciable basis, were placed in service in the fourth
 * quarter. Callers pass every such asset for the year.
 */
export function midQuarterApplies(
  assets: Array<{ placedInService: string; basis: Cents; realProperty: boolean }>,
): boolean {
  const personal = assets.filter((a) => !a.realProperty);
  const total = personal.reduce((sum, a) => sum + a.basis, 0);
  if (total <= 0) return false;

  const fourthQuarter = personal
    .filter((a) => Number(a.placedInService.slice(5, 7)) >= 10)
    .reduce((sum, a) => sum + a.basis, 0);

  return fourthQuarter / total > 0.4;
}
