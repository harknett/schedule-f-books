/**
 * Money is stored and computed as integer cents, never as a float.
 * Every amount crossing the DB boundary is a whole number of cents.
 */

export type Cents = number;

/** Parse user input ("1,234.56", "$12", "12.5") into cents. Throws on garbage. */
export function parseAmount(input: string): Cents {
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  if (cleaned === "") throw new Error("Amount is required.");
  if (!/^-?\d*(\.\d{0,2})?$/.test(cleaned) || cleaned === "." || cleaned === "-") {
    throw new Error(`"${input}" is not a valid amount. Use digits and up to two decimals.`);
  }
  const negative = cleaned.startsWith("-");
  const [whole = "0", frac = ""] = cleaned.replace(/^-/, "").split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new Error("Amount is too large.");
  return negative ? -cents : cents;
}

/** 123456 -> "1,234.56" */
export function formatAmount(cents: Cents): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toLocaleString("en-US");
  const frac = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

/** 123456 -> "$1,234.56" */
export function formatUsd(cents: Cents): string {
  const negative = cents < 0;
  return `${negative ? "-" : ""}$${formatAmount(Math.abs(cents))}`;
}
