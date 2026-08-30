import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createZip, crc32 } from "@/lib/zip";

/**
 * A ZIP that only this code can read would be useless, so these tests check the
 * output against the system `unzip` rather than against a reader written here:
 * the archive is extracted for real and the bytes compared.
 */

let workDir: string;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "zip-test-"));
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

function writeArchive(buffer: Buffer): string {
  const file = path.join(workDir, "archive.zip");
  fs.writeFileSync(file, buffer);
  return file;
}

/** Extract with the real tool and return the files it produced. */
function extract(buffer: Buffer): Map<string, Buffer> {
  const archive = writeArchive(buffer);
  const out = path.join(workDir, "out");
  execFileSync("unzip", ["-q", "-o", archive, "-d", out]);

  const found = new Map<string, Buffer>();
  const walk = (dir: string, prefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(full, name);
      else found.set(name, fs.readFileSync(full));
    }
  };
  walk(out, "");
  return found;
}

describe("crc32", () => {
  it("matches the known checksum for a standard input", () => {
    // The canonical CRC-32 of "123456789".
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });
});

describe("createZip", () => {
  it("produces an archive unzip reports as intact", () => {
    const archive = writeArchive(
      createZip([
        { name: "hello.txt", data: "hello world" },
        { name: "nested/deeper/file.csv", data: "a,b\n1,2\n" },
      ]),
    );
    const output = execFileSync("unzip", ["-t", archive], { encoding: "utf8" });
    expect(output).toContain("No errors detected");
  });

  it("round-trips text through a real extraction", () => {
    const files = extract(
      createZip([
        { name: "hello.txt", data: "hello world" },
        { name: "notes/readme.txt", data: "line one\nline two\n" },
      ]),
    );
    expect(files.get("hello.txt")?.toString()).toBe("hello world");
    expect(files.get("notes/readme.txt")?.toString()).toBe("line one\nline two\n");
  });

  it("round-trips binary data byte for byte", () => {
    // Random bytes do not compress, so this also exercises the stored path.
    const blob = randomBytes(64 * 1024);
    const files = extract(createZip([{ name: "receipts/photo.jpg", data: blob }]));
    expect(files.get("receipts/photo.jpg")?.equals(blob)).toBe(true);
  });

  it("compresses repetitive text, and stores what deflate would grow", () => {
    const repetitive = Buffer.from("the same line over and over\n".repeat(500));
    const incompressible = randomBytes(4096);

    const compressed = createZip([{ name: "a.txt", data: repetitive }]);
    const stored = createZip([{ name: "a.bin", data: incompressible }]);

    expect(compressed.length).toBeLessThan(repetitive.length / 2);
    // Storing costs only the headers, never more than the payload plus a little.
    expect(stored.length).toBeLessThan(incompressible.length + 300);

    // Both must still extract correctly.
    expect(extract(compressed).get("a.txt")?.equals(repetitive)).toBe(true);
    expect(extract(stored).get("a.bin")?.equals(incompressible)).toBe(true);
  });

  it("keeps an empty file empty", () => {
    const files = extract(createZip([{ name: "empty.txt", data: "" }]));
    expect(files.get("empty.txt")?.length).toBe(0);
  });

  it("writes a valid, if empty, archive when there is nothing to include", () => {
    const buffer = createZip([]);
    // Just the end-of-central-directory record.
    expect(buffer.length).toBe(22);
    expect(buffer.readUInt32LE(0)).toBe(0x06054b50);
    expect(buffer.readUInt16LE(10)).toBe(0); // no entries

    // Info-ZIP treats an empty archive as a warning and exits non-zero, so the
    // structural check above is the assertion; this just pins the behaviour.
    const archive = writeArchive(buffer);
    expect(() => execFileSync("unzip", ["-t", archive], { stdio: "pipe" })).toThrow();
  });

  it("writes UTF-8 names with the flag that says so", () => {
    const buffer = createZip([{ name: "reçus/déjà-vu.txt", data: "café" }]);

    // Bit 11 of the general purpose flags marks the name as UTF-8.
    expect(buffer.readUInt16LE(6) & 0x0800).toBe(0x0800);

    // And the bytes really are UTF-8, not some code page.
    const nameLength = buffer.readUInt16LE(26);
    expect(buffer.subarray(30, 30 + nameLength).toString("utf8")).toBe("reçus/déjà-vu.txt");

    // Python's zipfile honours the flag, so it round-trips there. Info-ZIP 6.00
    // predates reliable bit-11 support and mangles such names on extraction,
    // which is why every name this app puts in an archive is ASCII.
    const archive = writeArchive(buffer);
    const readBack = execFileSync(
      "python3",
      [
        "-c",
        "import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);print(z.namelist()[0]);print(z.read(z.namelist()[0]).decode());print(z.testzip())",
        archive,
      ],
      { encoding: "utf8" },
    ).trim().split("\n");

    expect(readBack[0]).toBe("reçus/déjà-vu.txt");
    expect(readBack[1]).toBe("café");
    expect(readBack[2]).toBe("None"); // testzip found no errors
  });

  it("lists every entry in the central directory", () => {
    const names = ["a.txt", "b/c.txt", "b/d/e.txt", "f.bin"];
    const archive = writeArchive(
      createZip(names.map((name) => ({ name, data: `contents of ${name}` }))),
    );
    const listing = execFileSync("zipinfo", ["-1", archive], { encoding: "utf8" });
    expect(listing.trim().split("\n").sort()).toEqual([...names].sort());
  });

  it("records the modification time it was given", () => {
    const when = new Date(2026, 2, 14, 10, 30, 0);
    const archive = writeArchive(
      createZip([{ name: "dated.txt", data: "x", date: when }]),
    );
    const listing = execFileSync("zipinfo", ["-l", archive], { encoding: "utf8" });
    expect(listing).toContain("26-Mar-14");
  });

  it("handles many files at once", () => {
    const entries = Array.from({ length: 500 }, (_, i) => ({
      name: `receipts/receipt-${i}.txt`,
      data: `receipt number ${i}`,
    }));
    const files = extract(createZip(entries));
    expect(files.size).toBe(500);
    expect(files.get("receipts/receipt-499.txt")?.toString()).toBe("receipt number 499");
  });

  it("refuses more entries than the format can hold", () => {
    const tooMany = Array.from({ length: 70000 }, (_, i) => ({
      name: `f${i}`,
      data: "",
    }));
    expect(() => createZip(tooMany)).toThrow(/at most|narrower/i);
  });
});
