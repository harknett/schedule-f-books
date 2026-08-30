"use client";

import { useMemo, useState } from "react";

import { Card, Field, Input } from "@/components/ui";
import { yearsInRange } from "@/lib/export";

export interface ExportCounts {
  /** Transactions per year, keyed by year. */
  transactionsByYear: Record<number, number>;
  timeEntriesByYear: Record<number, number>;
  receiptsByYear: Record<number, number>;
  receiptBytesByYear: Record<number, number>;
  assetCount: number;
  /** Years with any activity, newest first, for the quick picks. */
  activeYears: number[];
  isOwner: boolean;
}

function humanBytes(bytes: number): string {
  if (bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function sumOver<T extends Record<number, number>>(source: T, years: number[]): number {
  return years.reduce((total, year) => total + (source[year] ?? 0), 0);
}

export function ExportChooser({
  counts,
  today,
  initialYear,
}: {
  counts: ExportCounts;
  today: string;
  initialYear: number;
}) {
  const thisYear = Number(today.slice(0, 4));
  const [from, setFrom] = useState(`${initialYear}-01-01`);
  const [to, setTo] = useState(`${initialYear}-12-31`);
  const [includeReceipts, setIncludeReceipts] = useState(true);
  const [includeJson, setIncludeJson] = useState(true);
  const [allHours, setAllHours] = useState(false);

  const valid = from !== "" && to !== "" && from <= to;
  const years = useMemo(() => (valid ? yearsInRange(from, to) : []), [from, to, valid]);

  const transactions = sumOver(counts.transactionsByYear, years);
  const timeEntries = sumOver(counts.timeEntriesByYear, years);
  const receipts = sumOver(counts.receiptsByYear, years);
  const receiptBytes = sumOver(counts.receiptBytesByYear, years);

  const query = new URLSearchParams({ from, to });
  if (!includeReceipts) query.set("receipts", "0");
  if (!includeJson) query.set("json", "0");
  if (allHours) query.set("allHours", "1");

  function setYear(year: number) {
    setFrom(`${year}-01-01`);
    setTo(`${year}-12-31`);
  }

  function setAllTime() {
    const first = counts.activeYears.at(-1) ?? thisYear;
    setFrom(`${first}-01-01`);
    setTo(`${thisYear}-12-31`);
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-5">
        <Field label="Period">
          <div className="flex flex-wrap gap-2">
            {counts.activeYears.slice(0, 4).map((year) => (
              <button
                key={year}
                type="button"
                onClick={() => setYear(year)}
                className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                  from === `${year}-01-01` && to === `${year}-12-31`
                    ? "bg-accent text-white dark:text-[#12140f]"
                    : "border border-line bg-surface text-muted hover:bg-surface-muted"
                }`}
              >
                {year}
              </button>
            ))}
            {counts.activeYears.length > 1 ? (
              <button
                type="button"
                onClick={setAllTime}
                className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-muted hover:bg-surface-muted"
              >
                Everything
              </button>
            ) : null}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From" htmlFor="from">
            <Input
              id="from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              required
            />
          </Field>
          <Field label="To" htmlFor="to">
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
          </Field>
        </div>

        {!valid ? (
          <p className="text-sm text-danger">The start date must be on or before the end date.</p>
        ) : null}

        <div className="space-y-2.5">
          <Toggle
            checked={includeReceipts}
            onChange={setIncludeReceipts}
            label={`Include receipt images (${receipts}, about ${humanBytes(receiptBytes)})`}
            hint="Needed for substantiation. Leave out for a smaller file."
          />
          <Toggle
            checked={includeJson}
            onChange={setIncludeJson}
            label="Include archive.json"
            hint="The same data losslessly, in cents. Keep it for archiving."
          />
          {counts.isOwner ? (
            <Toggle
              checked={allHours}
              onChange={setAllHours}
              label="Include hours logged by everyone"
              hint="Otherwise only your own hours are exported."
            />
          ) : null}
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">What you will get</h2>
        <ul className="space-y-1.5 text-sm">
          <Line name="README.txt" detail="What the package holds, and the caveats." />
          {years.map((year) => (
            <Line
              key={year}
              name={`schedule-f-${year}.csv`}
              detail="Every Schedule F line, ready to transcribe."
            />
          ))}
          <Line
            name="transactions.csv"
            detail={`${transactions} ${transactions === 1 ? "entry" : "entries"}, each with its Schedule F line.`}
          />
          {counts.assetCount > 0 ? (
            <>
              <Line name="assets.csv" detail={`${counts.assetCount} depreciable assets.`} />
              {years.map((year) => (
                <Line
                  key={year}
                  name={`depreciation-${year}.csv`}
                  detail="Per-asset working for Form 4562."
                />
              ))}
            </>
          ) : null}
          {timeEntries > 0 ? (
            <Line name="hours.csv" detail={`${timeEntries} time entries.`} />
          ) : null}
          {includeReceipts && receipts > 0 ? (
            <Line name="receipts/" detail={`${receipts} images, named to match transactions.csv.`} />
          ) : null}
          {includeJson ? (
            <Line name="archive.json" detail="Lossless copy for archiving." />
          ) : null}
        </ul>

        <a
          href={valid ? `/export/download?${query.toString()}` : undefined}
          aria-disabled={!valid}
          className={`inline-flex w-full items-center justify-center rounded-xl min-h-12 px-4 font-medium ${
            valid
              ? "bg-accent text-white dark:text-[#12140f]"
              : "pointer-events-none bg-surface-muted text-muted"
          }`}
        >
          Download {includeReceipts && receiptBytes > 0 ? `(~${humanBytes(receiptBytes)})` : "ZIP"}
        </a>

        {transactions === 0 && timeEntries === 0 ? (
          <p className="text-sm text-muted">
            Nothing was recorded in this period. The package will still contain the summary and the
            asset register.
          </p>
        ) : null}
      </Card>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex items-start gap-2.5 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
      />
      <span>
        {label}
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  );
}

function Line({ name, detail }: { name: string; detail: string }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2">
      <code className="font-mono text-xs text-accent">{name}</code>
      <span className="text-muted">{detail}</span>
    </li>
  );
}
