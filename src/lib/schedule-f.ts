/**
 * The Schedule F (Form 1040) chart of accounts.
 *
 * Every transaction is filed against one of these lines, so the year-end
 * report is a direct roll-up rather than a reclassification exercise.
 *
 * Line numbers follow the Schedule F layout but are a convenience, not tax
 * advice - verify against the current year's form and instructions before
 * filing. See the README's disclaimer.
 */

export type CategoryKind = "income" | "expense";

export interface Category {
  /** Stable key persisted on every transaction. Never renumber these. */
  id: string;
  kind: CategoryKind;
  /** Schedule F line, e.g. "1a", "21b", "32". */
  line: string;
  label: string;
  /** Plain-language hint shown under the picker. */
  hint?: string;
  /**
   * A cost recorded inside Part I (income) that reduces gross income rather
   * than appearing in Part II. Only line 1b behaves this way.
   */
  contra?: boolean;
}

export const INCOME_CATEGORIES: Category[] = [
  {
    id: "resale_sales",
    kind: "income",
    line: "1a",
    label: "Sales of resale livestock & items",
    hint: "Livestock and other items you bought and resold.",
  },
  {
    id: "resale_cost",
    kind: "income",
    line: "1b",
    label: "Cost of resale livestock & items",
    hint: "What you paid for the items on line 1a. Subtracted from gross income.",
    contra: true,
  },
  {
    id: "raised_sales",
    kind: "income",
    line: "2",
    label: "Sales of raised livestock, produce & grains",
    hint: "Everything you raised or grew yourself. Most farm sales land here.",
  },
  {
    id: "coop_distributions",
    kind: "income",
    line: "3a",
    label: "Cooperative distributions",
    hint: "Patronage dividends and per-unit retains (Form 1099-PATR).",
  },
  {
    id: "ag_program_payments",
    kind: "income",
    line: "4a",
    label: "Agricultural program payments",
    hint: "Government farm program payments (Form 1099-G).",
  },
  {
    id: "ccc_loans",
    kind: "income",
    line: "5a",
    label: "CCC loans reported under election",
    hint: "Commodity Credit Corporation loans you elect to report as income.",
  },
  {
    id: "ccc_forfeited",
    kind: "income",
    line: "5b",
    label: "CCC loans forfeited",
  },
  {
    id: "crop_insurance",
    kind: "income",
    line: "6a",
    label: "Crop insurance & disaster payments",
  },
  {
    id: "custom_hire_income",
    kind: "income",
    line: "7",
    label: "Custom hire (machine work) income",
    hint: "Money you earned doing machine work for others.",
  },
  {
    id: "other_income",
    kind: "income",
    line: "8",
    label: "Other income",
    hint: "Fuel tax credits/refunds, and anything not covered above.",
  },
];

export const EXPENSE_CATEGORIES: Category[] = [
  {
    id: "car_truck",
    kind: "expense",
    line: "10",
    label: "Car & truck",
    hint: "Keep mileage records - the standard mileage rate is usually claimed here.",
  },
  { id: "chemicals", kind: "expense", line: "11", label: "Chemicals" },
  { id: "conservation", kind: "expense", line: "12", label: "Conservation expenses" },
  {
    id: "custom_hire_expense",
    kind: "expense",
    line: "13",
    label: "Custom hire (machine work)",
    hint: "Machine work you paid someone else to do.",
  },
  {
    id: "depreciation",
    kind: "expense",
    line: "14",
    label: "Depreciation & section 179",
    hint: "Usually entered once at year end from your depreciation schedule.",
  },
  { id: "employee_benefits", kind: "expense", line: "15", label: "Employee benefit programs" },
  { id: "feed", kind: "expense", line: "16", label: "Feed" },
  { id: "fertilizers_lime", kind: "expense", line: "17", label: "Fertilizers & lime" },
  { id: "freight_trucking", kind: "expense", line: "18", label: "Freight & trucking" },
  { id: "fuel", kind: "expense", line: "19", label: "Gasoline, fuel & oil" },
  {
    id: "insurance",
    kind: "expense",
    line: "20",
    label: "Insurance (other than health)",
  },
  { id: "interest_mortgage", kind: "expense", line: "21a", label: "Interest - mortgage" },
  { id: "interest_other", kind: "expense", line: "21b", label: "Interest - other" },
  {
    id: "labor_hired",
    kind: "expense",
    line: "22",
    label: "Labor hired",
    hint: "Wages paid to farm employees, less any employment credits.",
  },
  { id: "pension_profit_sharing", kind: "expense", line: "23", label: "Pension & profit-sharing" },
  {
    id: "rent_equipment",
    kind: "expense",
    line: "24a",
    label: "Rent/lease - vehicles, machinery, equipment",
  },
  {
    id: "rent_other",
    kind: "expense",
    line: "24b",
    label: "Rent/lease - land, animals, other",
  },
  { id: "repairs_maintenance", kind: "expense", line: "25", label: "Repairs & maintenance" },
  { id: "seeds_plants", kind: "expense", line: "26", label: "Seeds & plants" },
  { id: "storage_warehousing", kind: "expense", line: "27", label: "Storage & warehousing" },
  {
    id: "supplies",
    kind: "expense",
    line: "28",
    label: "Supplies",
    hint: "Consumables that aren't feed, seed, or chemicals.",
  },
  { id: "taxes", kind: "expense", line: "29", label: "Taxes", hint: "Property, payroll. Not income tax." },
  { id: "utilities", kind: "expense", line: "30", label: "Utilities" },
  {
    id: "vet_breeding_medicine",
    kind: "expense",
    line: "31",
    label: "Veterinary, breeding & medicine",
  },
  {
    id: "other_expense",
    kind: "expense",
    line: "32",
    label: "Other expenses",
    hint: "Schedule F asks you to specify these - use the description field.",
  },
];

export const ALL_CATEGORIES: Category[] = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];

const BY_ID = new Map(ALL_CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: string): Category | undefined {
  return BY_ID.get(id);
}

export function requireCategory(id: string): Category {
  const category = BY_ID.get(id);
  if (!category) throw new Error(`Unknown Schedule F category: "${id}".`);
  return category;
}

export function categoriesFor(kind: CategoryKind): Category[] {
  return kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

/** Sort key so "21a" < "21b" < "22" and "2" < "10". */
export function lineSortKey(line: string): [number, string] {
  const match = /^(\d+)([a-z]?)$/.exec(line);
  if (!match) return [Number.MAX_SAFE_INTEGER, line];
  return [Number(match[1]), match[2] ?? ""];
}
