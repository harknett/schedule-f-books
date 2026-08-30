/**
 * A minimal ZIP writer.
 *
 * Node ships zlib but no archiver, and the container format is small enough to
 * own rather than take a dependency for: a local header per file, a central
 * directory, and an end-of-central-directory record.
 *
 * Deliberately not implementing Zip64, so the limits below are checked and
 * refused rather than silently producing an archive that no tool can open.
 */

import "server-only";

import { deflateRawSync } from "node:zlib";

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;

const STORED = 0;
const DEFLATED = 8;

/** Bit 11 tells the reader that names and comments are UTF-8. */
const UTF8_FLAG = 0x0800;

/** Without Zip64 a ZIP holds at most 65535 entries and 4 GB. */
const MAX_ENTRIES = 0xffff;
const MAX_BYTES = 0xffffffff;

export interface ZipEntry {
  /** Path within the archive, using forward slashes. */
  name: string;
  data: Buffer | string;
  /** Defaults to now. */
  date?: Date;
}

let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let bit = 0; bit < 8; bit++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  crcTable = table;
  return table;
}

export function crc32(buffer: Buffer): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = table[(crc ^ buffer[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS packed time: seconds have two-second resolution, hence the halving. */
function dosTime(date: Date): number {
  return (
    (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f)
  );
}

/** MS-DOS packed date, counting years from 1980. */
function dosDate(date: Date): number {
  const year = Math.max(1980, date.getFullYear());
  return ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
}

interface Prepared {
  nameBytes: Buffer;
  body: Buffer;
  method: number;
  crc: number;
  uncompressedSize: number;
  time: number;
  date: number;
  offset: number;
}

/**
 * Build a ZIP archive in memory.
 *
 * Entries are deflated only when that actually makes them smaller - already
 * compressed data such as a JPEG receipt is stored as-is rather than paying
 * for a pass that would grow it.
 */
export function createZip(entries: ZipEntry[]): Buffer {
  if (entries.length > MAX_ENTRIES) {
    throw new Error(
      `An archive can hold at most ${MAX_ENTRIES} files; this one has ${entries.length}. Export a narrower date range.`,
    );
  }

  const prepared: Prepared[] = [];
  const chunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, "utf8");
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, "utf8");
    const when = entry.date ?? new Date();

    const deflated = raw.length > 0 ? deflateRawSync(raw) : Buffer.alloc(0);
    const useDeflate = deflated.length > 0 && deflated.length < raw.length;
    const body = useDeflate ? deflated : raw;

    const record: Prepared = {
      nameBytes,
      body,
      method: useDeflate ? DEFLATED : STORED,
      crc: crc32(raw),
      uncompressedSize: raw.length,
      time: dosTime(when),
      date: dosDate(when),
      offset,
    };

    const header = Buffer.alloc(30);
    header.writeUInt32LE(LOCAL_HEADER, 0);
    header.writeUInt16LE(20, 4); // version needed to extract
    header.writeUInt16LE(UTF8_FLAG, 6);
    header.writeUInt16LE(record.method, 8);
    header.writeUInt16LE(record.time, 10);
    header.writeUInt16LE(record.date, 12);
    header.writeUInt32LE(record.crc, 14);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(record.uncompressedSize, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    header.writeUInt16LE(0, 28); // no extra field

    chunks.push(header, nameBytes, body);
    offset += header.length + nameBytes.length + body.length;

    if (offset > MAX_BYTES) {
      throw new Error("That archive would exceed 4 GB. Export a narrower date range.");
    }
    prepared.push(record);
  }

  const centralStart = offset;
  for (const record of prepared) {
    const header = Buffer.alloc(46);
    header.writeUInt32LE(CENTRAL_HEADER, 0);
    header.writeUInt16LE(20, 4); // version made by
    header.writeUInt16LE(20, 6); // version needed
    header.writeUInt16LE(UTF8_FLAG, 8);
    header.writeUInt16LE(record.method, 10);
    header.writeUInt16LE(record.time, 12);
    header.writeUInt16LE(record.date, 14);
    header.writeUInt32LE(record.crc, 16);
    header.writeUInt32LE(record.body.length, 20);
    header.writeUInt32LE(record.uncompressedSize, 24);
    header.writeUInt16LE(record.nameBytes.length, 28);
    header.writeUInt16LE(0, 30); // extra length
    header.writeUInt16LE(0, 32); // comment length
    header.writeUInt16LE(0, 34); // disk number start
    header.writeUInt16LE(0, 36); // internal attributes
    // External attributes: regular file, 0644, in the high word Unix tools read.
    header.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    header.writeUInt32LE(record.offset, 42);

    chunks.push(header, record.nameBytes);
    offset += header.length + record.nameBytes.length;
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY, 0);
  end.writeUInt16LE(0, 4); // this disk
  end.writeUInt16LE(0, 6); // disk with the central directory
  end.writeUInt16LE(prepared.length, 8);
  end.writeUInt16LE(prepared.length, 10);
  end.writeUInt32LE(offset - centralStart, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20); // no archive comment
  chunks.push(end);

  return Buffer.concat(chunks);
}
