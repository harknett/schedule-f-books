/**
 * Building the export package.
 *
 * Two jobs at once, which pull in slightly different directions:
 *
 *   - a handover, which a preparer opens in a spreadsheet. Amounts are dollars,
 *     every transaction carries the Schedule F line it belongs to, and the
 *     depreciation detail is there to fill in Form 4562.
 *   - an archive, which is a complete record you can still read in ten years.
 *     archive.json holds the same data losslessly, in cents, alongside the
 *     receipt images.
 *
 * Everything here is pure: it takes data and returns files. Reading receipts
 * off disk is the caller's job, so this stays testable.
 */

import { assetClassLabel, deductionFor, scheduleFor } from "./assets";
import { toCsv, type CsvRow } from "./csv";
import type { Asset, Receipt, TimeEntry, TransactionWithMeta } from "./db/types";
import { prettyDate } from "./dates";
import { CONVENTION_LABELS, METHOD_LABELS } from "./depreciation";
import { formatHours } from "./duration";
import type { Cents } from "./money";
import { buildReport, reportToCsv } from "./report";
import { getCategory } from "./schedule-f";
import type { ZipEntry } from "./zip";

/** CSV amounts are plain dollars: no symbol, no separators, spreadsheet-safe. */
function dollars(cents: Cents): string {
  return (cents / 100).toFixed(2);
}

export interface ExportTimeEntry extends TimeEntry {
  userName: string | null;
}

export interface ExportInput {
  from: string;
  to: string;
  generatedAt: Date;
  generatedBy: string;
  transactions: TransactionWithMeta[];
  receiptsByTransaction: Map<number, Receipt[]>;
  assets: Asset[];
  timeEntries: ExportTimeEntry[];
  /** Already-loaded receipt files, named as they appear in the archive. */
  receiptFiles: ZipEntry[];
  includeReceipts: boolean;
  includeArchiveJson: boolean;
}

/** Tax years touched by the range, ascending. Schedule F is an annual form. */
export function yearsInRange(from: string, to: string): number[] {
  const first = Number(from.slice(0, 4));
  const last = Number(to.slice(0, 4));
  const years: number[] = [];
  for (let year = first; year <= last; year++) years.push(year);
  return years;
}

/**
 * Name a receipt inside the archive so it ties back to its transaction at a
 * glance, and sorts sensibly. ASCII only, because Info-ZIP mangles UTF-8 names.
 */
export function receiptArchiveName(transactionId: number, index: number, filename: string): string {
  const extension = /\.[a-z0-9]+$/i.exec(filename)?.[0].toLowerCase() ?? "";
  return `receipts/txn-${String(transactionId).padStart(6, "0")}-${index + 1}${extension}`;
}

export function transactionsCsv(input: ExportInput): string {
  const rows: CsvRow[] = [
    [
      "id",
      "date",
      "kind",
      "schedule_f_line",
      "category",
      "category_id",
      "amount",
      "payee",
      "description",
      "payment_method",
      "receipts",
      "receipt_files",
      "entered_by",
    ],
  ];

  for (const t of input.transactions) {
    const category = getCategory(t.categoryId);
    const receipts = input.receiptsByTransaction.get(t.id) ?? [];
    rows.push([
      String(t.id),
      t.date,
      t.kind,
      category?.line ?? "",
      category?.label ?? t.categoryId,
      t.categoryId,
      dollars(t.amount),
      t.payee ?? "",
      t.description ?? "",
      t.paymentMethod ?? "",
      String(receipts.length),
      input.includeReceipts
        ? receipts.map((r, i) => receiptArchiveName(t.id, i, r.filename)).join(" ")
        : "",
      t.createdByName ?? "",
    ]);
  }
  return toCsv(rows);
}

export function assetsCsv(assets: Asset[]): string {
  const rows: CsvRow[] = [
    [
      "id",
      "name",
      "description",
      "property_class",
      "method",
      "convention",
      "placed_in_service",
      "cost",
      "business_use_percent",
      "section_179",
      "bonus_percent",
      "bonus_amount",
      "depreciable_basis",
      "disposed_date",
      "disposal_proceeds",
      "notes",
    ],
  ];

  for (const asset of assets) {
    const schedule = scheduleFor(asset);
    rows.push([
      String(asset.id),
      asset.name,
      asset.description ?? "",
      assetClassLabel(asset),
      METHOD_LABELS[asset.method],
      CONVENTION_LABELS[asset.convention],
      asset.placedInService,
      dollars(asset.cost),
      String(asset.businessUsePercent),
      dollars(schedule.section179),
      String(asset.bonusPercent),
      dollars(schedule.bonus),
      dollars(schedule.depreciableBasis),
      asset.disposedDate ?? "",
      asset.disposalProceeds != null ? dollars(asset.disposalProceeds) : "",
      asset.notes ?? "",
    ]);
  }
  return toCsv(rows);
}

/** Per-asset depreciation for one tax year - the working for Form 4562. */
export function depreciationCsv(assets: Asset[], year: number): string {
  const rows: CsvRow[] = [
    [
      "asset_id",
      "asset",
      "property_class",
      "method",
      "convention",
      "placed_in_service",
      "cost",
      "section_179",
      "bonus",
      "depreciable_basis",
      `deduction_${year}`,
      `accumulated_through_${year}`,
      `remaining_after_${year}`,
    ],
  ];

  let total = 0;
  for (const asset of assets) {
    const deduction = deductionFor(asset, year);
    const placedYear = Number(asset.placedInService.slice(0, 4));
    if (deduction === 0 && placedYear !== year) continue;

    const schedule = scheduleFor(asset);
    const throughYear = schedule.years.filter((y) => y.year <= year).at(-1);
    const accumulated =
      (throughYear?.accumulated ?? 0) + (placedYear <= year ? schedule.firstYearWriteOff : 0);
    const remaining = throughYear?.remaining ?? schedule.depreciableBasis;

    total += deduction;
    rows.push([
      String(asset.id),
      asset.name,
      assetClassLabel(asset),
      METHOD_LABELS[asset.method],
      CONVENTION_LABELS[asset.convention],
      asset.placedInService,
      dollars(asset.cost),
      dollars(placedYear === year ? schedule.section179 : 0),
      dollars(placedYear === year ? schedule.bonus : 0),
      dollars(schedule.depreciableBasis),
      dollars(deduction),
      dollars(accumulated),
      dollars(remaining),
    ]);
  }

  rows.push(["", "TOTAL", "", "", "", "", "", "", "", "", dollars(total), "", ""]);
  return toCsv(rows);
}

export function hoursCsv(entries: ExportTimeEntry[]): string {
  const rows: CsvRow[] = [["date", "person", "task", "minutes", "hours", "notes"]];
  let totalMinutes = 0;

  for (const entry of entries) {
    totalMinutes += entry.minutes;
    rows.push([
      entry.date,
      entry.userName ?? "",
      entry.task,
      String(entry.minutes),
      formatHours(entry.minutes),
      entry.notes ?? "",
    ]);
  }

  rows.push(["", "TOTAL", "", String(totalMinutes), formatHours(totalMinutes), ""]);
  return toCsv(rows);
}

/** Lossless dump, in cents, for archiving and for reading back later. */
export function archiveJson(input: ExportInput): string {
  return (
    JSON.stringify(
      {
        format: "schedule-f-books/export",
        formatVersion: 1,
        generatedAt: input.generatedAt.toISOString(),
        generatedBy: input.generatedBy,
        range: { from: input.from, to: input.to },
        note: "All money is in integer cents. Time is in whole minutes.",
        transactions: input.transactions.map((t) => ({
          id: t.id,
          kind: t.kind,
          categoryId: t.categoryId,
          scheduleFLine: getCategory(t.categoryId)?.line ?? null,
          date: t.date,
          amountCents: t.amount,
          payee: t.payee,
          description: t.description,
          paymentMethod: t.paymentMethod,
          enteredBy: t.createdByName,
          createdAt: t.createdAt,
          receipts: (input.receiptsByTransaction.get(t.id) ?? []).map((r, i) => ({
            id: r.id,
            file: input.includeReceipts ? receiptArchiveName(t.id, i, r.filename) : null,
            mimeType: r.mimeType,
            byteSize: r.byteSize,
          })),
        })),
        assets: input.assets.map((asset) => {
          const schedule = scheduleFor(asset);
          return {
            id: asset.id,
            name: asset.name,
            description: asset.description,
            assetClassId: asset.assetClassId,
            method: asset.method,
            convention: asset.convention,
            placedInService: asset.placedInService,
            costCents: asset.cost,
            section179Cents: asset.section179,
            bonusPercent: asset.bonusPercent,
            businessUsePercent: asset.businessUsePercent,
            depreciableBasisCents: schedule.depreciableBasis,
            disposedDate: asset.disposedDate,
            disposalProceedsCents: asset.disposalProceeds,
            notes: asset.notes,
            schedule: schedule.years.map((y) => ({
              year: y.year,
              amountCents: y.amount,
              accumulatedCents: y.accumulated,
              remainingCents: y.remaining,
              basis: y.basisOf,
            })),
          };
        }),
        timeEntries: input.timeEntries.map((entry) => ({
          id: entry.id,
          date: entry.date,
          person: entry.userName,
          minutes: entry.minutes,
          task: entry.task,
          notes: entry.notes,
        })),
      },
      null,
      2,
    ) + "\n"
  );
}

export function readmeText(input: ExportInput, years: number[]): string {
  const income = input.transactions
    .filter((t) => t.kind === "income")
    .reduce((sum, t) => sum + t.amount, 0);
  const expenses = input.transactions
    .filter((t) => t.kind === "expense")
    .reduce((sum, t) => sum + t.amount, 0);
  const minutes = input.timeEntries.reduce((sum, e) => sum + e.minutes, 0);
  const receiptCount = input.receiptFiles.length;

  // Built as pairs and padded to the widest name, so the columns line up
  // whatever the years in the range make the filenames.
  const contents: Array<[string, string]> = [
    ...years.map(
      (year): [string, string] => [
        `schedule-f-${year}.csv`,
        `Schedule F line by line for ${year}, ready to transcribe.`,
      ],
    ),
    ["transactions.csv", "Every income and expense entry, with its Schedule F line."],
  ];

  if (input.assets.length > 0) {
    contents.push(["assets.csv", "The depreciable asset register."]);
    for (const year of years) {
      contents.push([
        `depreciation-${year}.csv`,
        `Per-asset depreciation for ${year}; the working for Form 4562.`,
      ]);
    }
  }
  if (input.timeEntries.length > 0) {
    contents.push(["hours.csv", "Hours worked on the farm."]);
  }
  if (input.includeReceipts && receiptCount > 0) {
    contents.push([
      "receipts/",
      "Receipt images, named txn-<id>-<n> to match transactions.csv.",
    ]);
  }
  if (input.includeArchiveJson) {
    contents.push([
      "archive.json",
      "The same data losslessly, in cents, for archiving or reloading.",
    ]);
  }

  const nameWidth = Math.max(...contents.map(([name]) => name.length));

  const lines: string[] = [
    "SCHEDULE F BOOKS - EXPORT",
    "=========================",
    "",
    `Covering        ${prettyDate(input.from)} to ${prettyDate(input.to)}`,
    `Generated       ${input.generatedAt.toISOString().slice(0, 19).replace("T", " ")} UTC`,
    `Generated by    ${input.generatedBy}`,
    "",
    "WHAT IS IN HERE",
    "---------------",
    ...contents.map(([name, detail]) => `  ${name.padEnd(nameWidth + 3)}${detail}`),
  ];

  lines.push(
    "",
    "TOTALS FOR THE RANGE",
    "--------------------",
    `  Entries              ${input.transactions.length}`,
    `  Income               $${dollars(income)}`,
    `  Expenses             $${dollars(expenses)}   (before depreciation)`,
    `  Assets on register   ${input.assets.length}`,
    `  Hours logged         ${formatHours(minutes)}`,
    `  Receipt images       ${input.includeReceipts ? receiptCount : "not included"}`,
    "",
    "NOTES FOR WHOEVER PREPARES THE RETURN",
    "-------------------------------------",
    "  * Amounts in the CSV files are dollars. archive.json uses integer cents.",
    "  * Every transaction already carries the Schedule F line it was filed",
    "    against, so the summary is a roll-up, not a reclassification.",
    "  * Line 14 in the summary combines the depreciation schedule with any",
    "    depreciation entered by hand. depreciation-<year>.csv shows the",
    "    asset-by-asset working.",
    "  * Taxable-amount lines (3b, 4b, 5c, 6b) are shown equal to the gross",
    "    amounts recorded. Elections and deferrals are not modelled, and",
    "    line 32 is a single bucket rather than 32a-32f.",
    "  * Section 179 limits and phase-outs, bonus percentages, the",
    "    business-income limitation, and recapture on disposal are NOT applied",
    "    here. They were entered by hand and need checking.",
    "",
    "  This is a summary of what was recorded. It is not tax advice and not a",
    "  filable form. Please check it against the current year's Schedule F and",
    "  Form 4562 instructions.",
    "",
  );

  return lines.join("\n");
}

/** Assemble the whole package. */
export function buildExportEntries(input: ExportInput): ZipEntry[] {
  const years = yearsInRange(input.from, input.to);
  const when = input.generatedAt;
  const entries: ZipEntry[] = [];

  const add = (name: string, data: Buffer | string) => entries.push({ name, data, date: when });

  add("README.txt", readmeText(input, years));

  // One Schedule F per tax year the range touches.
  for (const year of years) {
    const inYear = input.transactions.filter((t) => t.date.slice(0, 4) === String(year));
    const totals = new Map<string, { total: number; count: number }>();
    for (const t of inYear) {
      const current = totals.get(t.categoryId) ?? { total: 0, count: 0 };
      totals.set(t.categoryId, { total: current.total + t.amount, count: current.count + 1 });
    }

    const assetDepreciation = input.assets.reduce(
      (sum, asset) => sum + deductionFor(asset, year),
      0,
    );
    const report = buildReport(
      year,
      [...totals].map(([categoryId, v]) => ({ categoryId, ...v })),
      { assetDepreciation },
    );
    add(`schedule-f-${year}.csv`, reportToCsv(report));

    if (input.assets.length > 0) {
      add(`depreciation-${year}.csv`, depreciationCsv(input.assets, year));
    }
  }

  add("transactions.csv", transactionsCsv(input));
  if (input.assets.length > 0) add("assets.csv", assetsCsv(input.assets));
  if (input.timeEntries.length > 0) add("hours.csv", hoursCsv(input.timeEntries));
  if (input.includeArchiveJson) add("archive.json", archiveJson(input));
  if (input.includeReceipts) {
    for (const file of input.receiptFiles) entries.push({ ...file, date: when });
  }

  return entries;
}

/** `farm-books-2026-01-01-to-2026-12-31.zip` */
export function exportFileName(from: string, to: string): string {
  return `farm-books-${from}-to-${to}.zip`;
}
