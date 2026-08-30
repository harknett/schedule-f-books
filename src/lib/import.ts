/**
 * Turning somebody else's CSV into entries in these books.
 *
 * The work is mostly in being forgiving about input without being careless
 * about it: guessing which column is which, working out whether 03/04/2026 is
 * March or April, accepting the several ways people write a duration, and
 * refusing a row rather than storing a number nobody meant.
 *
 * Nothing here touches the database or the filesystem, so the same code runs
 * in the browser for the preview and on the server for the commit. The server
 * re-parses from the original text rather than trusting a parsed row list.
 */

import { normalizeHeader, type CsvRow } from "./csv";
import { parseDuration } from "./duration";
import { isIsoDate } from "./dates";
import { parseAmount, type Cents } from "./money";
import {
  categoriesFor,
  getCategory,
  type Category,
  type CategoryKind,
} from "./schedule-f";

export type ImportKind = "expense" | "income" | "time";

export const IMPORT_KIND_LABELS: Record<ImportKind, string> = {
  expense: "Expenses",
  income: "Income",
  time: "Hours worked",
};

export interface FieldSpec {
  key: string;
  label: string;
  required: boolean;
  hint?: string;
  /** Normalised header names that map to this field, best match first. */
  aliases: string[];
}

const DATE_FIELD: FieldSpec = {
  key: "date",
  label: "Date",
  required: true,
  aliases: [
    "date",
    "transaction date",
    "posted date",
    "posting date",
    "post date",
    "date posted",
    "day",
    "when",
  ],
};

const TRANSACTION_FIELDS: FieldSpec[] = [
  DATE_FIELD,
  {
    key: "amount",
    label: "Amount",
    required: true,
    hint: "Signs are ignored; the amount is filed by the kind you chose.",
    aliases: ["amount", "debit", "credit", "total", "value", "sum", "cost", "price", "paid"],
  },
  {
    key: "payee",
    label: "Paid to / received from",
    required: false,
    aliases: [
      "payee",
      "vendor",
      "merchant",
      "supplier",
      "customer",
      "name",
      "paid to",
      "received from",
      "who",
      // Last resort. A bank export often has only a "Description" column, and
      // that column is the merchant - which belongs in payee, where the entry
      // list shows it. A file with both Payee and Description still splits
      // correctly, because payee matches its own name on an earlier alias.
      "description",
    ],
  },
  {
    key: "description",
    label: "Description",
    required: false,
    aliases: ["description", "memo", "details", "notes", "note", "reference", "particulars"],
  },
  {
    key: "category",
    label: "Schedule F category",
    required: false,
    hint: "Accepts a line number (16), a category name (Feed), or our id (feed).",
    aliases: ["category", "schedule f", "schedule f line", "line", "account", "class", "type"],
  },
  {
    key: "paymentMethod",
    label: "Payment method",
    required: false,
    aliases: ["payment method", "method", "paid by", "card", "tender"],
  },
];

const TIME_FIELDS: FieldSpec[] = [
  DATE_FIELD,
  {
    key: "duration",
    label: "Time worked",
    required: true,
    hint: "Accepts 2.5, 2h 30m, 2:30, or 90m. A bare number means hours.",
    aliases: ["hours", "duration", "time", "time worked", "hrs", "minutes", "qty", "quantity"],
  },
  {
    key: "task",
    label: "Task",
    required: true,
    aliases: ["task", "activity", "job", "work", "description", "what", "category"],
  },
  {
    key: "notes",
    label: "Notes",
    required: false,
    aliases: ["notes", "note", "memo", "details", "comment", "comments"],
  },
];

export function fieldsFor(kind: ImportKind): FieldSpec[] {
  return kind === "time" ? TIME_FIELDS : TRANSACTION_FIELDS;
}

/** Column index for each field key; -1 means "not mapped". */
export type Mapping = Record<string, number>;

/**
 * Guess a mapping from the header row.
 *
 * An exact alias match wins over a partial one, and each column is claimed by
 * at most one field, so a single "description" column doesn't end up feeding
 * both payee and description.
 */
export function autoMap(headers: string[], kind: ImportKind): Mapping {
  const normalized = headers.map(normalizeHeader);
  const mapping: Mapping = {};
  const claimed = new Set<number>();

  const fields = fieldsFor(kind);

  // Exact matches first, in field order, then partial.
  for (const pass of ["exact", "partial"] as const) {
    for (const field of fields) {
      if (mapping[field.key] != null && mapping[field.key] !== -1) continue;

      for (const alias of field.aliases) {
        const index = normalized.findIndex((header, i) => {
          if (claimed.has(i)) return false;
          return pass === "exact" ? header === alias : header.includes(alias);
        });
        if (index !== -1) {
          mapping[field.key] = index;
          claimed.add(index);
          break;
        }
      }
    }
  }

  for (const field of fields) {
    if (mapping[field.key] == null) mapping[field.key] = -1;
  }
  return mapping;
}

// --- dates ----------------------------------------------------------------

/** Which component comes first in an ambiguous numeric date. */
export type DateOrder = "mdy" | "dmy";

export const DATE_ORDER_LABELS: Record<DateOrder, string> = {
  mdy: "Month first (US, 03/04 = 4 March)",
  dmy: "Day first (03/04 = 3 April)",
};

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const NUMERIC_DATE = /^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{2,4})$/;

/**
 * Work out whether a file's numeric dates are day-first or month-first.
 *
 * A value above 12 in either position settles it. With no such evidence the
 * file is genuinely ambiguous, so this returns the US default and the caller
 * shows the choice rather than deciding silently - reading 03/04 as the wrong
 * month puts an entry in the wrong quarter.
 */
export function detectDateOrder(samples: string[]): { order: DateOrder; certain: boolean } {
  for (const sample of samples) {
    const match = NUMERIC_DATE.exec(sample.trim());
    if (!match) continue;
    const first = Number(match[1]);
    const second = Number(match[2]);
    if (first > 12 && first <= 31) return { order: "dmy", certain: true };
    if (second > 12 && second <= 31) return { order: "mdy", certain: true };
  }
  return { order: "mdy", certain: false };
}

function expandYear(year: number): number {
  if (year >= 100) return year;
  // POSIX-style pivot; these books are always near the present.
  return year <= 68 ? 2000 + year : 1900 + year;
}

function isRealDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Parse the date formats that turn up in exports. Throws with a usable message. */
export function parseFlexibleDate(value: string, order: DateOrder): string {
  const input = value.trim();
  if (input === "") throw new Error("Date is empty.");

  if (isIsoDate(input)) return input;

  // 2026-03-04 or 2026/03/04
  const isoish = /^(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})$/.exec(input);
  if (isoish) {
    const [y, m, d] = [Number(isoish[1]), Number(isoish[2]), Number(isoish[3])];
    if (isRealDate(y, m, d)) return iso(y, m, d);
    throw new Error(`"${value}" is not a real date.`);
  }

  // 03/04/2026, 3-4-26, 03.04.2026
  const numeric = NUMERIC_DATE.exec(input);
  if (numeric) {
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    const y = expandYear(Number(numeric[3]));
    // Let an out-of-range value override the chosen order rather than fail.
    const dayFirst = a > 12 ? true : b > 12 ? false : order === "dmy";
    const [m, d] = dayFirst ? [b, a] : [a, b];
    if (isRealDate(y, m, d)) return iso(y, m, d);
    throw new Error(`"${value}" is not a real date.`);
  }

  // 5 Jan 2026 / Jan 5, 2026 / January 5 2026
  const words = input.toLowerCase().replace(/,/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 3) {
    const monthAt = words.findIndex((w) => MONTH_NAMES[w] != null);
    if (monthAt !== -1) {
      const m = MONTH_NAMES[words[monthAt]!]!;
      const rest = words.filter((_, i) => i !== monthAt).map(Number);
      if (rest.every((n) => Number.isFinite(n))) {
        // The four-digit-looking one is the year.
        const [first, second] = rest as [number, number];
        const [d, y] = first > 31 ? [second, first] : [first, expandYear(second)];
        if (isRealDate(y, m, d)) return iso(y, m, d);
      }
    }
  }

  throw new Error(`"${value}" is not a date I recognise.`);
}

// --- categories -----------------------------------------------------------

/** Match a CSV cell to a Schedule F category by id, line number, or label. */
export function resolveCategory(raw: string, kind: CategoryKind): Category | undefined {
  const value = raw.trim();
  if (value === "") return undefined;

  const byId = getCategory(value.toLowerCase().replace(/[\s-]+/g, "_"));
  if (byId && byId.kind === kind) return byId;

  const options = categoriesFor(kind);
  const lower = value.toLowerCase();

  const byLine = options.find((c) => c.line.toLowerCase() === lower);
  if (byLine) return byLine;

  const byLabel = options.find((c) => c.label.toLowerCase() === lower);
  if (byLabel) return byLabel;

  // "16 Feed" or "Feed (16)" - a line number with its label attached.
  const leadingLine = /^(\d{1,2}[a-z]?)\b/.exec(lower);
  if (leadingLine) {
    const found = options.find((c) => c.line.toLowerCase() === leadingLine[1]);
    if (found) return found;
  }
  return undefined;
}

// --- row parsing ----------------------------------------------------------

export interface ImportedTransaction {
  kind: CategoryKind;
  categoryId: string;
  date: string;
  amount: Cents;
  payee: string | null;
  description: string | null;
  paymentMethod: string | null;
}

export interface ImportedTimeEntry {
  date: string;
  minutes: number;
  task: string;
  notes: string | null;
}

export type ImportedRecord = ImportedTransaction | ImportedTimeEntry;

export interface ParsedRow<T> {
  /** 1-based line in the file, counting the header. */
  line: number;
  raw: CsvRow;
  value: T | null;
  error: string | null;
  warnings: string[];
  /** Set by the caller once existing records are known. */
  duplicate?: boolean;
}

export interface ParseOptions {
  kind: ImportKind;
  mapping: Mapping;
  dateOrder: DateOrder;
  /** Used for any row whose category cell is empty or unrecognised. */
  defaultCategoryId?: string;
  /** True when the file's first row is column names. */
  hasHeader: boolean;
}

function cell(row: CsvRow, index: number | undefined): string {
  if (index == null || index < 0) return "";
  return (row[index] ?? "").trim();
}

export interface ParseResult<T> {
  rows: ParsedRow<T>[];
  valid: number;
  invalid: number;
}

export function parseRows(
  rows: CsvRow[],
  options: ParseOptions,
): ParseResult<ImportedRecord> {
  const body = options.hasHeader ? rows.slice(1) : rows;
  const offset = options.hasHeader ? 2 : 1;

  const parsed = body.map((raw, i) => {
    const line = i + offset;
    const warnings: string[] = [];
    try {
      const value =
        options.kind === "time"
          ? parseTimeRow(raw, options)
          : parseTransactionRow(raw, options, warnings);
      return { line, raw, value, error: null, warnings };
    } catch (err) {
      return {
        line,
        raw,
        value: null,
        error: err instanceof Error ? err.message : "Could not read this row.",
        warnings,
      };
    }
  });

  return {
    rows: parsed,
    valid: parsed.filter((r) => r.value !== null).length,
    invalid: parsed.filter((r) => r.value === null).length,
  };
}

function parseTransactionRow(
  raw: CsvRow,
  options: ParseOptions,
  warnings: string[],
): ImportedTransaction {
  const kind: CategoryKind = options.kind === "income" ? "income" : "expense";

  const date = parseFlexibleDate(cell(raw, options.mapping.date), options.dateOrder);

  const amountText = cell(raw, options.mapping.amount);
  if (amountText === "") throw new Error("Amount is empty.");
  // Parentheses are an accounting convention for a negative.
  const negated = /^\(.*\)$/.test(amountText);
  const signed = parseAmount(negated ? amountText.replace(/[()]/g, "") : amountText);
  const magnitude = Math.abs(signed);
  if (magnitude === 0) throw new Error("Amount is zero.");

  // The schema stores a positive amount and takes direction from the kind, so
  // a sign that disagrees is worth flagging rather than silently flipping.
  const isNegative = negated || signed < 0;
  if (isNegative && kind === "income") {
    warnings.push("Negative amount imported as income; check it isn't a refund.");
  }

  const categoryText = cell(raw, options.mapping.category);
  const matched = categoryText === "" ? undefined : resolveCategory(categoryText, kind);
  if (categoryText !== "" && !matched) {
    warnings.push(`Category "${categoryText}" wasn't recognised; used the default.`);
  }

  const categoryId = matched?.id ?? options.defaultCategoryId;
  if (!categoryId) throw new Error("No category, and no default chosen.");
  const category = getCategory(categoryId);
  if (!category || category.kind !== kind) {
    throw new Error(`"${categoryId}" is not a valid ${kind} category.`);
  }

  const payee = cell(raw, options.mapping.payee);
  const description = cell(raw, options.mapping.description);
  const paymentMethod = cell(raw, options.mapping.paymentMethod);

  return {
    kind,
    categoryId,
    date,
    amount: magnitude,
    payee: payee || null,
    description: description || null,
    paymentMethod: paymentMethod || null,
  };
}

function parseTimeRow(raw: CsvRow, options: ParseOptions): ImportedTimeEntry {
  const date = parseFlexibleDate(cell(raw, options.mapping.date), options.dateOrder);

  const durationText = cell(raw, options.mapping.duration);
  if (durationText === "") throw new Error("Time worked is empty.");
  const minutes = parseDuration(durationText);

  const task = cell(raw, options.mapping.task);
  if (task === "") throw new Error("Task is empty.");

  const notes = cell(raw, options.mapping.notes);
  return { date, minutes, task, notes: notes || null };
}

// --- duplicates -----------------------------------------------------------

/**
 * Key for spotting a row already in the books. Re-importing last month's bank
 * export shouldn't quietly double the expenses, and matching on the fields a
 * person would compare by eye is close enough to be useful without being so
 * strict that a re-typed payee hides a real duplicate.
 */
export function transactionKey(t: {
  kind: string;
  date: string;
  amount: number;
  payee: string | null;
}): string {
  return [t.kind, t.date, t.amount, (t.payee ?? "").trim().toLowerCase()].join("|");
}

export function timeEntryKey(t: { date: string; minutes: number; task: string }): string {
  return [t.date, t.minutes, t.task.trim().toLowerCase()].join("|");
}

export function isTransaction(record: ImportedRecord): record is ImportedTransaction {
  return "amount" in record;
}

/** Mark rows whose key already exists, or repeats earlier in the same file. */
export function flagDuplicates(
  rows: ParsedRow<ImportedRecord>[],
  existingKeys: Set<string>,
): void {
  const seen = new Set(existingKeys);
  for (const row of rows) {
    if (!row.value) continue;
    const key = isTransaction(row.value)
      ? transactionKey(row.value)
      : timeEntryKey(row.value);
    row.duplicate = seen.has(key);
    seen.add(key);
  }
}

// --- commit contract ------------------------------------------------------

/**
 * Limits on an import. Sized to refuse the wrong file rather than to ration a
 * real one: a farm's whole year of bank activity is far below both.
 *
 * These live here rather than beside the server action because a "use server"
 * module may only export async functions.
 */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;

export interface CommitRequest {
  kind: ImportKind;
  csvText: string;
  mapping: Mapping;
  dateOrder: DateOrder;
  hasHeader: boolean;
  defaultCategoryId: string;
  skipDuplicates: boolean;
}

export interface CommitResult {
  error?: string;
  imported?: number;
  skippedDuplicates?: number;
  skippedInvalid?: number;
}

/** A blank template for someone starting from scratch rather than an export. */
export function templateFor(kind: ImportKind): string {
  if (kind === "time") {
    return [
      "Date,Hours,Task,Notes",
      "2026-03-14,2.5,Fencing,North boundary",
      "2026-03-15,1:30,Livestock chores,",
    ].join("\n") + "\n";
  }
  const example =
    kind === "income"
      ? ["2026-06-15,482.50,Saturday market,Mixed vegetables,2,Cash"]
      : ["2026-02-11,245.75,Valley Co-op,Hay,16,Debit card"];
  return (
    ["Date,Amount,Payee,Description,Category,Payment method", ...example].join("\n") + "\n"
  );
}
