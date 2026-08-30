"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";

import { commitImport } from "./actions";
import { Button, Card, ErrorBanner, Field, Select } from "@/components/ui";
import { parseCsv, stripBom } from "@/lib/csv";
import { formatDuration } from "@/lib/duration";
import {
  DATE_ORDER_LABELS,
  IMPORT_KIND_LABELS,
  autoMap,
  detectDateOrder,
  fieldsFor,
  flagDuplicates,
  isTransaction,
  parseRows,
  type CommitResult,
  type DateOrder,
  type ImportedRecord,
  type ImportKind,
  type Mapping,
  type ParseResult,
} from "@/lib/import";
import { formatUsd } from "@/lib/money";
import { categoriesFor, getCategory } from "@/lib/schedule-f";

const KINDS: ImportKind[] = ["expense", "income", "time"];
const PREVIEW_LIMIT = 50;

export function Importer({ existingKeys }: { existingKeys: Record<ImportKind, string[]> }) {
  const [kind, setKind] = useState<ImportKind>("expense");
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [dateOrder, setDateOrder] = useState<DateOrder>("mdy");
  const [dateOrderCertain, setDateOrderCertain] = useState(true);
  const [defaultCategoryId, setDefaultCategoryId] = useState("other_expense");
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const [result, setResult] = useState<CommitResult | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => (csvText ? parseCsv(csvText) : []), [csvText]);
  const headers = hasHeader && rows.length > 0 ? rows[0]! : [];
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);

  /** Read a chosen file, then guess its shape so the preview is useful immediately. */
  function loadText(text: string, name: string | null) {
    const clean = stripBom(text);
    const parsed = parseCsv(clean);
    if (parsed.length === 0) {
      setReadError("That file has no rows.");
      return;
    }

    setReadError(null);
    setResult(null);
    setCsvText(clean);
    setFileName(name);

    const header = parsed[0]!;
    const guessed = autoMap(header, kind);
    setMapping(guessed);

    // Sample the mapped date column to work out day-first versus month-first.
    const dateColumn = guessed.date;
    const samples =
      dateColumn >= 0 ? parsed.slice(1, 40).map((row) => row[dateColumn] ?? "") : [];
    const detected = detectDateOrder(samples);
    setDateOrder(detected.order);
    setDateOrderCertain(detected.certain);
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setReadError("That file is larger than 2 MB. Split it and import in parts.");
      return;
    }
    file
      .text()
      .then((text) => loadText(text, file.name))
      .catch(() => setReadError("That file could not be read."));
  }

  function chooseKind(next: ImportKind) {
    setKind(next);
    setDefaultCategoryId(next === "income" ? "raised_sales" : "other_expense");
    setResult(null);
    // Column names mean different things per kind, so re-guess.
    if (rows.length > 0) setMapping(autoMap(rows[0]!, next));
  }

  function reset() {
    setCsvText("");
    setFileName(null);
    setMapping(null);
    setResult(null);
    setReadError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const preview = useMemo(() => {
    if (!mapping || rows.length === 0) return null;
    const parsed = parseRows(rows, {
      kind,
      mapping,
      dateOrder,
      defaultCategoryId: defaultCategoryId || undefined,
      hasHeader,
    });
    flagDuplicates(parsed.rows, new Set(existingKeys[kind]));
    return parsed;
  }, [rows, mapping, kind, dateOrder, defaultCategoryId, hasHeader, existingKeys]);

  /**
   * Required fields with no column behind them. Usually this means the wrong
   * sort of record is selected - a timesheet loaded as expenses reports every
   * row as "Amount is empty", which says nothing about the actual mistake.
   */
  const missingRequired = mapping
    ? fieldsFor(kind)
        .filter((field) => field.required && (mapping[field.key] ?? -1) < 0)
        .map((field) => field.label.toLowerCase())
    : [];

  const duplicateCount = preview?.rows.filter((r) => r.duplicate).length ?? 0;
  const willImport =
    (preview?.valid ?? 0) - (skipDuplicates ? duplicateCount : 0);

  function submit() {
    if (!mapping) return;
    startTransition(async () => {
      const outcome = await commitImport({
        kind,
        csvText,
        mapping,
        dateOrder,
        hasHeader,
        defaultCategoryId,
        skipDuplicates,
      });
      setResult(outcome);
      if (outcome.imported != null) {
        setCsvText("");
        setFileName(null);
        setMapping(null);
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  }

  if (result?.imported != null) {
    return <Summary kind={kind} result={result} onAgain={() => setResult(null)} />;
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <Field label="What are you importing?">
          <div className="grid grid-cols-3 gap-2">
            {KINDS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => chooseKind(option)}
                aria-pressed={kind === option}
                className={`rounded-xl border min-h-12 px-3 text-sm font-medium transition-colors ${
                  kind === option
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-surface text-muted hover:bg-surface-muted"
                }`}
              >
                {IMPORT_KIND_LABELS[option]}
              </button>
            ))}
          </div>
        </Field>

        <Field
          label="CSV file"
          hint={
            <>
              Exported from a bank, a spreadsheet, or a timesheet.{" "}
              <Link href={`/import/${kind}-template.csv`} className="underline">
                Download a template
              </Link>
            </>
          }
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={(e) => onFile(e.target.files?.[0])}
            className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-accent file:font-medium"
          />
        </Field>

        <ErrorBanner message={readError ?? result?.error} />

        {fileName ? (
          <p className="text-sm text-muted">
            {fileName} · {rows.length} {rows.length === 1 ? "line" : "lines"} ·{" "}
            <button type="button" onClick={reset} className="underline">
              choose another
            </button>
          </p>
        ) : null}
      </Card>

      {mapping && preview ? (
        <>
          <Card className="space-y-5">
            <div>
              <h2 className="font-semibold">Match the columns</h2>
              <p className="text-sm text-muted mt-0.5">
                Guessed from the header. Change anything that looks wrong.
              </p>
            </div>

            {missingRequired.length > 0 ? (
              <p className="rounded-xl border border-expense/40 bg-expense/10 px-3 py-2.5 text-sm text-expense">
                No column is matched to {missingRequired.join(" or ")}. Pick the right one below —
                or, if this file is a different sort of record, change what you are importing at the
                top.
              </p>
            ) : null}

            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={hasHeader}
                onChange={(e) => {
                  setHasHeader(e.target.checked);
                  if (e.target.checked && rows.length > 0) setMapping(autoMap(rows[0]!, kind));
                }}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              The first row is column names
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              {fieldsFor(kind).map((field) => (
                <Field
                  key={field.key}
                  label={`${field.label}${field.required ? "" : " (optional)"}`}
                  htmlFor={`map-${field.key}`}
                  hint={field.hint}
                >
                  <Select
                    id={`map-${field.key}`}
                    value={String(mapping[field.key] ?? -1)}
                    onChange={(e) =>
                      setMapping({ ...mapping, [field.key]: Number(e.target.value) })
                    }
                  >
                    <option value="-1">Not in this file</option>
                    {Array.from({ length: columnCount }, (_, i) => (
                      <option key={i} value={i}>
                        {headers[i]?.trim() || `Column ${i + 1}`}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Date format"
                htmlFor="dateOrder"
                hint={
                  dateOrderCertain
                    ? "Worked out from the dates in the file."
                    : "Every date in this file could be read either way — check this is right."
                }
              >
                <Select
                  id="dateOrder"
                  value={dateOrder}
                  onChange={(e) => setDateOrder(e.target.value as DateOrder)}
                >
                  {(Object.keys(DATE_ORDER_LABELS) as DateOrder[]).map((order) => (
                    <option key={order} value={order}>
                      {DATE_ORDER_LABELS[order]}
                    </option>
                  ))}
                </Select>
              </Field>

              {kind !== "time" ? (
                <Field
                  label="Category for unmatched rows"
                  htmlFor="defaultCategory"
                  hint="Used where the file has no category, or one we don't recognise."
                >
                  <Select
                    id="defaultCategory"
                    value={defaultCategoryId}
                    onChange={(e) => setDefaultCategoryId(e.target.value)}
                  >
                    {categoriesFor(kind === "income" ? "income" : "expense").map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.line} · {c.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
            </div>

            {duplicateCount > 0 ? (
              <label className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-muted p-3 text-sm">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(e) => setSkipDuplicates(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                />
                <span>
                  Skip {duplicateCount} {duplicateCount === 1 ? "row that looks" : "rows that look"}{" "}
                  already recorded
                  <span className="block text-xs text-muted">
                    Matched on date, amount, and who it was with.
                  </span>
                </span>
              </label>
            ) : null}
          </Card>

          <PreviewTable kind={kind} preview={preview} />

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {willImport} of {preview.rows.length} {preview.rows.length === 1 ? "row" : "rows"} will
              be imported.
            </p>
            <Button type="button" onClick={submit} disabled={pending || willImport <= 0}>
              {pending ? "Importing…" : `Import ${willImport}`}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function PreviewTable({
  kind,
  preview,
}: {
  kind: ImportKind;
  preview: ParseResult<ImportedRecord>;
}) {
  const shown = preview.rows.slice(0, PREVIEW_LIMIT);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-semibold">Preview</h2>
        <p className="text-sm text-muted">
          {preview.valid} readable
          {preview.invalid > 0 ? ` · ${preview.invalid} with problems` : null}
        </p>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-2.5 font-medium">Line</th>
                <th className="px-3 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium">
                  {kind === "time" ? "Task" : "Paid to / from"}
                </th>
                <th className="px-3 py-2.5 font-medium">
                  {kind === "time" ? "Notes" : "Category"}
                </th>
                <th className="px-3 py-2.5 text-right font-medium">
                  {kind === "time" ? "Time" : "Amount"}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {shown.map((row) => {
                if (!row.value) {
                  return (
                    <tr key={row.line} className="bg-danger/5">
                      <td className="tabular px-3 py-2 text-muted">{row.line}</td>
                      <td colSpan={4} className="px-3 py-2 text-danger">
                        {row.error}
                      </td>
                    </tr>
                  );
                }

                const record = row.value;
                return (
                  <tr key={row.line} className={row.duplicate ? "text-muted" : ""}>
                    <td className="tabular px-3 py-2 text-muted">
                      {row.line}
                      {row.duplicate ? (
                        <span className="ml-1.5 rounded bg-surface-muted px-1.5 py-0.5 text-[10px] uppercase">
                          dup
                        </span>
                      ) : null}
                    </td>
                    <td className="tabular px-3 py-2">{record.date}</td>
                    <td className="px-3 py-2">
                      {isTransaction(record) ? (record.payee ?? "—") : record.task}
                      {row.warnings.length > 0 ? (
                        <span className="block text-xs text-expense">{row.warnings[0]}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {isTransaction(record)
                        ? (getCategory(record.categoryId)?.label ?? record.categoryId)
                        : (record.notes ?? "—")}
                    </td>
                    <td className="tabular px-3 py-2 text-right font-medium">
                      {isTransaction(record)
                        ? formatUsd(record.amount)
                        : formatDuration(record.minutes)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {preview.rows.length > PREVIEW_LIMIT ? (
        <p className="text-xs text-muted">
          Showing the first {PREVIEW_LIMIT} of {preview.rows.length} rows. All of them are imported.
        </p>
      ) : null}
    </section>
  );
}

function Summary({
  kind,
  result,
  onAgain,
}: {
  kind: ImportKind;
  result: CommitResult;
  onAgain: () => void;
}) {
  const destination = kind === "time" ? "/time" : "/transactions";

  return (
    <Card className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-accent">Import complete</p>
        <p className="text-3xl font-semibold tabular">{result.imported}</p>
        <p className="text-sm text-muted">
          {kind === "time" ? "time entries" : "entries"} added to your books.
        </p>
      </div>

      {result.skippedDuplicates ? (
        <p className="text-sm text-muted">
          {result.skippedDuplicates} skipped as already recorded.
        </p>
      ) : null}
      {result.skippedInvalid ? (
        <p className="text-sm text-muted">
          {result.skippedInvalid} skipped because they could not be read.
        </p>
      ) : null}

      <div className="flex gap-2">
        <Link
          href={destination}
          className="inline-flex items-center justify-center rounded-xl bg-accent px-4 min-h-12 font-medium text-white dark:text-[#12140f]"
        >
          See them
        </Link>
        <Button type="button" variant="secondary" onClick={onAgain}>
          Import another file
        </Button>
      </div>
    </Card>
  );
}
