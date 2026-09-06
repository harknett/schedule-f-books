import { describe, expect, it } from "vitest";

import { isUncategorised, suggestCategory } from "@/lib/categorise";

/** The id suggested, or undefined. */
function suggest(payee: string, description = ""): string | undefined {
  return suggestCategory(payee, description)?.category.id;
}

describe("suggestCategory", () => {
  it("reads ordinary farm payees", () => {
    expect(suggest("Tractor Supply — baler twine")).toBe("supplies");
    expect(suggest("Southern States Feed")).toBe("feed");
    expect(suggest("Johnson Veterinary Clinic")).toBe("vet_breeding_medicine");
    expect(suggest("Shell", "diesel for the tractor")).toBe("fuel");
    expect(suggest("County Farm Bureau", "crop insurance premium")).toBe("insurance");
    expect(suggest("Nitrogen and lime delivery")).toBe("fertilizers_lime");
  });

  it("prefers the more specific phrase when several match", () => {
    // "mortgage" alone would be enough; "mortgage interest" is the better read.
    expect(suggestCategory("First National", "mortgage interest")?.matchedOn).toBe(
      "mortgage interest",
    );
    // "seed" would match, but the longer phrase is what is actually meant.
    expect(suggestCategory("Green Cover", "cover crop seed")?.matchedOn).toBe("cover crop seed");
  });

  it("separates the two rent lines, which differ only by what is rented", () => {
    expect(suggest("Equipment rental — skid steer")).toBe("rent_equipment");
    expect(suggest("Neighbour — pasture rent")).toBe("rent_other");
  });

  it("says nothing rather than guessing", () => {
    // A bare bank descriptor names nothing a rule could honestly act on.
    expect(suggest("POS PURCHASE 4471")).toBeUndefined();
    expect(suggest("")).toBeUndefined();
    expect(suggest("Amazon")).toBeUndefined();
    expect(suggestCategory(null, null)).toBeUndefined();
  });

  it("does not fire on words that merely contain a keyword", () => {
    // Word boundaries: "proceeds" contains "seed", "boiler" contains "oil".
    expect(suggest("Proceeds adjustment")).toBeUndefined();
    expect(suggest("Boiler inspection")).toBeUndefined();
    // And the same word standing alone still works.
    expect(suggest("Seed order")).toBe("seeds_plants");
  });

  it("avoids the words that would produce confident nonsense", () => {
    // "gas" is natural gas (a utility) as often as gasoline, so it is only
    // matched inside a longer phrase.
    expect(suggest("Gas")).toBeUndefined();
    expect(suggest("Natural gas bill")).toBe("utilities");
    expect(suggest("Gasoline")).toBe("fuel");

    // "service" appears across custom hire, utilities and repairs.
    expect(suggest("Service")).toBeUndefined();

    // Bare "rental" cannot choose between line 24a and 24b.
    expect(suggest("Rental")).toBeUndefined();
  });

  it("marks a multi-word match as stronger than a single common word", () => {
    expect(suggestCategory("Acme", "equipment rental")?.confidence).toBe("strong");
    expect(suggestCategory("Acme", "hay")?.confidence).toBe("weak");
  });

  it("reads the description when the payee says nothing", () => {
    expect(suggest("Bill Smith", "hauling cattle to market")).toBe("freight_trucking");
  });

  it("is case and spacing insensitive", () => {
    expect(suggest("SOUTHERN  STATES   FEED")).toBe("feed");
    expect(suggest("veterinary")).toBe("vet_breeding_medicine");
  });

  it("never suggests the catch-all line it exists to clear", () => {
    // Suggesting "other expenses" would be a no-op dressed up as progress.
    const payees = [
      "Tractor Supply", "Shell diesel", "hay", "vet", "seed", "storage",
      "payroll", "freight", "mortgage interest", "property tax",
    ];
    for (const p of payees) {
      expect(suggestCategory(p, "")?.category.id).not.toBe("other_expense");
    }
  });

  it("only ever suggests real expense categories", () => {
    for (const p of ["hay", "diesel", "vet", "twine", "pasture rent", "payroll"]) {
      const s = suggestCategory(p, "");
      expect(s?.category.kind).toBe("expense");
    }
  });
});

describe("isUncategorised", () => {
  it("is the catch-all line and nothing else", () => {
    expect(isUncategorised("other_expense")).toBe(true);
    expect(isUncategorised("feed")).toBe(false);
    expect(isUncategorised("supplies")).toBe(false);
  });
});
