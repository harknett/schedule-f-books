import { describe, expect, it } from "vitest";

import { detectDelimiter, escapeCsvField, normalizeHeader, parseCsv, toCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("reads a plain file", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("keeps a delimiter that sits inside quotes", () => {
    expect(parseCsv('date,payee\n2026-01-01,"Smith, John & Sons"')).toEqual([
      ["date", "payee"],
      ["2026-01-01", "Smith, John & Sons"],
    ]);
  });

  it("unescapes doubled quotes", () => {
    expect(parseCsv('a\n"He said ""hello"""')).toEqual([["a"], ['He said "hello"']]);
  });

  it("keeps a newline inside a quoted field", () => {
    const rows = parseCsv('note\n"line one\nline two"');
    expect(rows).toEqual([["note"], ["line one\nline two"]]);
  });

  it("handles CRLF, lone CR, and a trailing newline", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(parseCsv("a,b\r1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips the byte order mark Excel writes", () => {
    const rows = parseCsv("﻿Date,Amount\n2026-01-01,5");
    expect(rows[0]).toEqual(["Date", "Amount"]);
  });

  it("drops blank lines but keeps genuinely empty fields", () => {
    expect(parseCsv("a,b,c\n\n1,,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "", "3"],
    ]);
  });

  it("trims unquoted fields but respects quoted whitespace", () => {
    expect(parseCsv('a,b\n  x  ,"  y  "')).toEqual([
      ["a", "b"],
      ["x", "  y  "],
    ]);
  });

  it("keeps ragged rows as they are, for the caller to judge", () => {
    expect(parseCsv("a,b,c\n1,2")).toEqual([
      ["a", "b", "c"],
      ["1", "2"],
    ]);
  });

  it("returns nothing for empty input", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("\n\n")).toEqual([]);
  });
});

describe("detectDelimiter", () => {
  it("finds commas, semicolons, and tabs", () => {
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
  });

  it("is not fooled by commas inside quoted fields", () => {
    const text = 'date;payee\n2026-01-01;"Smith, John, and Sons, Ltd"';
    expect(detectDelimiter(text)).toBe(";");
  });

  it("parses a semicolon file end to end without being told", () => {
    expect(parseCsv("date;amount\n2026-01-01;5,50")).toEqual([
      ["date", "amount"],
      ["2026-01-01", "5,50"],
    ]);
  });
});

describe("writing", () => {
  it("quotes only what needs it", () => {
    expect(escapeCsvField("plain")).toBe("plain");
    expect(escapeCsvField("has,comma")).toBe('"has,comma"');
    expect(escapeCsvField('has"quote')).toBe('"has""quote"');
  });

  it("round-trips through the parser", () => {
    const rows = [
      ["Date", "Payee", "Note"],
      ["2026-01-01", "Smith, John", 'He said "hi"'],
      ["2026-01-02", "", "line one\nline two"],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe("normalizeHeader", () => {
  it("flattens punctuation and case", () => {
    expect(normalizeHeader("Transaction Date")).toBe("transaction date");
    expect(normalizeHeader("transaction_date")).toBe("transaction date");
    expect(normalizeHeader("TRANSACTION-DATE")).toBe("transaction date");
    expect(normalizeHeader("  Amount ($) ")).toBe("amount");
  });
});
