/**
 * Guessing which Schedule F line an expense belongs on.
 *
 * A bank or card export names a payee and maybe a description. It never names
 * a Schedule F line, so an imported expense lands on whatever default was
 * chosen - in practice line 32, "other expenses", which is the one line that
 * tells a preparer nothing.
 *
 * These rules read the payee and description and propose a line. They are
 * deliberately conservative: a wrong suggestion that gets waved through is
 * worse than no suggestion, because it produces a return that looks itemised
 * and is quietly wrong. So the keywords are specific, every suggestion says
 * which words triggered it, and nothing is ever applied without being
 * accepted.
 *
 * Free of Node imports: the review screen scores rows as you type.
 */

import { getCategory, type Category } from "./schedule-f";

interface Rule {
  categoryId: string;
  /** Matched case-insensitively on word boundaries. */
  keywords: string[];
}

/**
 * Ordered by nothing in particular - the longest matching keyword wins, not
 * the first rule listed, so "cover crop seed" beats "seed".
 *
 * Words left out on purpose:
 *   "gas"      - natural gas is a utility, gasoline is fuel
 *   "oil"      - motor oil is fuel, but so is an oil filter (repairs)
 *   "service"  - appears in custom hire, utilities and repairs alike
 *   "rental"   - line 24a and 24b differ only by what is being rented
 * Each of those would produce confident nonsense, so they are matched only as
 * part of a longer phrase.
 */
const RULES: Rule[] = [
  {
    categoryId: "feed",
    keywords: [
      "feed", "feed store", "hay", "straw", "silage", "alfalfa", "forage",
      "molasses", "mineral tub", "salt lick", "grain", "corn", "soybean meal",
      "range cube", "creep feed", "chick feed", "chicken feed", "layer feed",
      "starter feed", "scratch grain",
    ],
  },
  {
    categoryId: "seeds_plants",
    keywords: [
      "seed", "seeds", "seeding", "seedling", "transplant", "cover crop seed",
      "nursery", "rootstock", "sapling", "bare root", "plug tray", "bulbs",
      "clover", "ryegrass", "rye grass", "overseeding", "frost seeding",
      "pasture mix", "wildflower",
    ],
  },
  {
    categoryId: "fertilizers_lime",
    keywords: [
      "fertilizer", "fertiliser", "lime", "compost", "manure", "nitrogen",
      "potash", "phosphate", "gypsum", "soil amendment", "biochar", "urea",
    ],
  },
  {
    categoryId: "chemicals",
    keywords: [
      "herbicide", "pesticide", "fungicide", "insecticide", "chemical",
      "weed killer", "crop protection",
    ],
  },
  {
    categoryId: "vet_breeding_medicine",
    keywords: [
      "vet", "veterinary", "veterinarian", "vaccine", "vaccination", "wormer",
      "dewormer", "antibiotic", "semen", "breeding", "artificial insemination",
      "animal health", "ear tag",
    ],
  },
  {
    categoryId: "fuel",
    keywords: [
      "fuel", "diesel", "gasoline", "petrol", "propane", "kerosene",
      "motor oil", "lubricant", "off road diesel", "fuel stop",
    ],
  },
  {
    categoryId: "repairs_maintenance",
    keywords: [
      "repair", "repairs", "maintenance", "spare parts", "welding", "tire",
      "tyre", "oil filter", "air filter", "hydraulic hose", "bearing",
      "sharpening", "tune up", "overhaul",
    ],
  },
  {
    categoryId: "supplies",
    keywords: [
      "supplies", "twine", "baler twine", "netting", "fencing", "fence post",
      "t-post", "t-posts", "barbed wire", "electric fence", "gloves",
      "hardware", "hardware cloth", "hand tools", "buckets", "tarp",
      "zip ties", "lumber", "plywood", "timber", "roofing", "feeder",
      "feeders", "waterer", "waterers", "nesting box", "bedding", "shavings",
    ],
  },
  {
    categoryId: "utilities",
    keywords: [
      "electric", "electricity", "power company", "water bill", "sewer",
      "internet", "broadband", "telephone", "phone bill", "utility",
      "natural gas", "trash pickup",
    ],
  },
  {
    categoryId: "insurance",
    keywords: [
      "insurance", "premium", "liability policy", "crop insurance",
      "farm policy", "underwriters",
    ],
  },
  {
    categoryId: "taxes",
    keywords: ["property tax", "real estate tax", "county tax", "tax assessment", "excise tax"],
  },
  {
    categoryId: "rent_equipment",
    keywords: [
      "equipment rental", "machinery rental", "tractor rental", "equipment lease",
      "machine hire", "skid steer rental", "excavator rental",
    ],
  },
  {
    categoryId: "rent_other",
    keywords: ["land rent", "pasture rent", "grazing lease", "barn rent", "farm lease"],
  },
  {
    categoryId: "labor_hired",
    keywords: ["payroll", "wages", "farmhand", "farm hand", "hired labor", "hired labour", "seasonal help"],
  },
  {
    categoryId: "custom_hire_expense",
    keywords: [
      "custom hire", "custom work", "baling", "combining", "bush hog",
      "excavation", "contract spraying", "silage chopping", "manure spreading",
    ],
  },
  {
    categoryId: "freight_trucking",
    keywords: ["freight", "trucking", "hauling", "haulage", "shipping", "courier", "livestock haul"],
  },
  {
    categoryId: "storage_warehousing",
    keywords: ["storage", "warehouse", "cold storage", "grain storage", "silo rent"],
  },
  {
    categoryId: "conservation",
    keywords: ["conservation", "erosion control", "terracing", "waterway", "riparian", "windbreak"],
  },
  {
    categoryId: "employee_benefits",
    keywords: ["employee benefit", "health insurance", "workers comp", "workers compensation"],
  },
  {
    categoryId: "pension_profit_sharing",
    keywords: ["pension", "profit sharing", "401k", "retirement plan", "sep ira"],
  },
  {
    categoryId: "interest_mortgage",
    keywords: ["mortgage interest", "mortgage payment", "mortgage"],
  },
  {
    categoryId: "interest_other",
    keywords: ["loan interest", "finance charge", "interest charge", "credit interest"],
  },
  {
    categoryId: "car_truck",
    keywords: ["mileage", "vehicle registration", "toll", "dmv", "license plate"],
  },
];

/**
 * Keywords that identify a category but could reasonably belong to another.
 *
 * Flagged rather than removed: "supplies" really is the best guess for a row
 * that says "supplies", but it deserves a second look in a way that
 * "ryegrass" does not. Word count is no guide here - "ryegrass" is one word
 * and unambiguous, "hand tools" is two and could be repairs.
 */
const WEAK_KEYWORDS = new Set([
  "supplies", "hardware", "hand tools", "grain", "corn", "storage", "hay",
  "straw", "power company", "utility", "premium", "interest charge", "toll",
  "bedding", "shavings", "timber", "lumber", "plywood", "roofing", "feeder",
  "feeders", "buckets", "tarp", "fencing",
]);

export interface Suggestion {
  category: Category;
  /** The exact words that triggered it, for showing the user why. */
  matchedOn: string;
  /**
   * How far to trust it. "weak" means the word fits this line but could
   * plausibly belong to another, so it is worth reading before accepting.
   */
  confidence: "strong" | "weak";
}

/** Word-boundary match, so "seed" does not fire on "seeded" or "proceeds". */
function mentions(haystack: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystack);
}

function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Propose a Schedule F line for an expense, or nothing.
 *
 * Returning nothing is a perfectly good answer, and much better than a guess:
 * the row simply stays where it is and waits for a human.
 */
export function suggestCategory(
  payee: string | null | undefined,
  description: string | null | undefined,
): Suggestion | undefined {
  const haystack = normalise(`${payee ?? ""} ${description ?? ""}`);
  if (haystack === "") return undefined;

  let best: { rule: Rule; keyword: string } | undefined;

  for (const rule of RULES) {
    for (const keyword of rule.keywords) {
      if (!mentions(haystack, keyword)) continue;
      // Longest match wins: "cover crop seed" is more informative than "seed",
      // and "mortgage interest" should beat "mortgage".
      if (!best || keyword.length > best.keyword.length) best = { rule, keyword };
    }
  }

  if (!best) return undefined;
  const category = getCategory(best.rule.categoryId);
  if (!category) return undefined;

  return {
    category,
    matchedOn: best.keyword,
    confidence: WEAK_KEYWORDS.has(best.keyword) ? "weak" : "strong",
  };
}

/** Whether a transaction is sitting on the catch-all line. */
export function isUncategorised(categoryId: string): boolean {
  return categoryId === "other_expense";
}
