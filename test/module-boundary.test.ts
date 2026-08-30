import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guards the client/server module boundary.
 *
 * A "use client" component that imports a module touching a Node builtin drags
 * that builtin into the browser bundle, where it is empty - the failure shows
 * up as a runtime TypeError in the user's face, not at build time, and only on
 * the page that renders the component. That is exactly how
 * `promisify(scrypt)` from lib/auth/password.ts reached the register page.
 *
 * `import "server-only"` makes the build fail instead, but only on modules
 * that remember to include it. This test is the belt to that braces: it walks
 * the real import graph from every client component.
 */

const SRC = path.join(process.cwd(), "src");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const ALL_FILES = walk(SRC);

function read(file: string): string {
  return fs.readFileSync(file, "utf8");
}

function isClientComponent(file: string): boolean {
  // The directive has to be the first statement in the file.
  return /^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(read(file));
}

/**
 * A "use server" module is a real boundary, not a leak: Next compiles each
 * exported action into a network reference, so a client component importing
 * one gets a stub, and nothing the action itself imports is bundled. Traversal
 * therefore stops here - following through would flag every correct use of a
 * Server Action.
 */
function isServerActionModule(file: string): boolean {
  return /^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use server["']/.test(read(file));
}

/** Import specifiers, excluding `import type` - those are erased at compile time. */
function importsOf(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /import\s+(type\s+)?([\s\S]*?)from\s+["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    const isTypeOnlyImport = Boolean(match[1]);
    const clause = match[2] ?? "";
    const specifier = match[3]!;
    if (isTypeOnlyImport) continue;
    // `import { type A, type B } from "x"` is also fully erased.
    const names = clause.replace(/[{}]/g, "").split(",").map((n) => n.trim()).filter(Boolean);
    if (names.length > 0 && names.every((n) => n.startsWith("type "))) continue;
    specifiers.push(specifier);
  }
  // Bare side-effect imports, e.g. `import "server-only"`.
  for (const match of source.matchAll(/import\s+["']([^"']+)["']/g)) {
    specifiers.push(match[1]!);
  }
  return specifiers;
}

/** Resolve an `@/...` or relative specifier to a file on disk. */
function resolve(specifier: string, fromFile: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = path.join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(fromFile), specifier);
  else return null; // a package, not our code

  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Every one of our own modules reachable from a file, following real imports. */
function reachableFrom(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    // Server Actions are compiled to RPC stubs; their imports never reach the browser.
    if (file !== entry && isServerActionModule(file)) continue;
    for (const specifier of importsOf(read(file))) {
      const resolved = resolve(specifier, file);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }
  seen.delete(entry);
  return [...seen];
}

const CLIENT_COMPONENTS = ALL_FILES.filter(isClientComponent);

function rel(file: string): string {
  return path.relative(process.cwd(), file);
}

describe("client/server module boundary", () => {
  it("finds the client components (a sanity check on the scan itself)", () => {
    expect(CLIENT_COMPONENTS.length).toBeGreaterThan(0);
    expect(CLIENT_COMPONENTS.map(rel)).toContain("src/app/(auth)/register/form.tsx");
  });

  it("no client component reaches a module importing a node: builtin", () => {
    const offences: string[] = [];

    for (const component of CLIENT_COMPONENTS) {
      for (const dependency of reachableFrom(component)) {
        const source = read(dependency);
        const builtin = /import\s[^;]*from\s+["'](node:[^"']+)["']/.exec(source);
        if (builtin) {
          offences.push(`${rel(component)} -> ${rel(dependency)} (imports ${builtin[1]})`);
        }
      }
    }

    expect(offences, `Client bundles would include a Node builtin:\n${offences.join("\n")}`).toEqual(
      [],
    );
  });

  it("no client component reaches a server-only module", () => {
    const offences: string[] = [];

    for (const component of CLIENT_COMPONENTS) {
      for (const dependency of reachableFrom(component)) {
        if (/^\s*import\s+["']server-only["']/m.test(read(dependency))) {
          offences.push(`${rel(component)} -> ${rel(dependency)}`);
        }
      }
    }

    expect(offences, `Client component reaches server-only code:\n${offences.join("\n")}`).toEqual(
      [],
    );
  });

  it("every module using a node: builtin is server-only or reached only through one", () => {
    // lib/db/store.ts is reached only via lib/db/index.ts, which is server-only.
    const EXEMPT = new Set(["src/lib/db/store.ts"]);

    const unguarded = ALL_FILES.filter((file) => {
      if (EXEMPT.has(rel(file))) return false;
      const source = read(file);
      if (!/import\s[^;]*from\s+["']node:/.test(source)) return false;
      return !/^\s*import\s+["']server-only["']/m.test(source);
    }).map(rel);

    expect(
      unguarded,
      `These touch Node builtins without a server-only guard:\n${unguarded.join("\n")}`,
    ).toEqual([]);
  });
});
