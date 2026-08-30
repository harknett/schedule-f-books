/**
 * A CSV reader and writer, following RFC 4180.
 *
 * Written by hand rather than pulled in as a dependency because the awkward
 * parts are few and worth owning: quoted fields containing the delimiter or a
 * newline, doubled quotes as an escaped quote, CRLF line endings, and the byte
 * order mark that Excel puts at the front of everything it exports.
 */

export type CsvRow = string[];

const BOM = "﻿";

/** Delimiters worth guessing between: comma, semicolon (EU Excel), tab. */
const CANDIDATE_DELIMITERS = [",", ";", "\t"] as const;

/**
 * Guess the delimiter by counting occurrences outside quoted spans on the
 * first few lines. Counting outside quotes matters: a comma inside a quoted
 * description shouldn't win the vote for a semicolon-separated file.
 */
export function detectDelimiter(text: string): string {
  const sample = stripBom(text).split(/\r?\n/).slice(0, 5).join("\n");

  let best = ",";
  let bestCount = 0;

  for (const delimiter of CANDIDATE_DELIMITERS) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < sample.length; i++) {
      const char = sample[i];
      if (char === '"') {
        if (inQuotes && sample[i + 1] === '"') i++;
        else inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        count++;
      }
    }
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

export function stripBom(text: string): string {
  return text.startsWith(BOM) ? text.slice(BOM.length) : text;
}

/**
 * Parse CSV text into rows of fields.
 *
 * Blank lines are dropped; a row whose every field is empty is not useful to
 * any caller here and trailing newlines would otherwise produce one.
 */
export function parseCsv(text: string, delimiter?: string): CsvRow[] {
  const source = stripBom(text);
  const sep = delimiter ?? detectDelimiter(source);

  const rows: CsvRow[] = [];
  let row: CsvRow = [];
  let field = "";
  let inQuotes = false;
  let fieldWasQuoted = false;

  const endField = () => {
    // Unquoted fields get trimmed; quoted ones are taken literally, because
    // the quoting is how a writer says "this whitespace is mine".
    row.push(fieldWasQuoted ? field : field.trim());
    field = "";
    fieldWasQuoted = false;
  };

  const endRow = () => {
    endField();
    if (row.some((value) => value !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < source.length; i++) {
    const char = source[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      fieldWasQuoted = true;
    } else if (char === sep) {
      endField();
    } else if (char === "\r") {
      // Consume CRLF as one break; a lone CR also ends the row.
      if (source[i + 1] === "\n") i++;
      endRow();
    } else if (char === "\n") {
      endRow();
    } else {
      field += char;
    }
  }

  // Whatever is left after the last newline is a final row.
  if (field !== "" || fieldWasQuoted || row.length > 0) endRow();

  return rows;
}

/** Quote a field only when it needs it. */
export function escapeCsvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: CsvRow[]): string {
  return rows.map((row) => row.map(escapeCsvField).join(",")).join("\n") + "\n";
}

/**
 * Normalise a header cell for matching: lowercase, strip punctuation and
 * collapse whitespace, so "Transaction Date", "transaction_date" and
 * "TRANSACTION-DATE" all compare equal.
 */
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
