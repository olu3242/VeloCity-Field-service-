import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Guards the metadata bootstrap invariant.
 *
 * The IDXF registries are populated by `bootstrapMetadata()`, which runs when
 * `@/lib/metadata` (the index) is imported. Importing only the sub-registries —
 * field-engine, entity-registry, relationship-registry, schema-registry —
 * leaves them empty.
 *
 * A module that reads a registry but does not import the index therefore
 * depends on some *other* module having been loaded first. That is decided by
 * bundler chunking, not by anything in the source, and it broke a production
 * build: dynamic-form-engine registers form rules at module scope, and when
 * webpack loaded it before the index every field looked unknown and the module
 * threw during page-data collection.
 *
 * The quieter variant is worse. Modules reading the registry inside a function
 * do not throw — they return an empty layout, no related sections or no
 * defaults, and report success.
 *
 * This is a static check rather than a runtime one on purpose: module caches
 * make load order unreproducible inside a single test process, so asserting the
 * import exists is both stronger and cheaper than trying to simulate it.
 */

const LIB = join(process.cwd(), "src/lib");

/** Importing any of these alone leaves the registries empty. */
const SUB_REGISTRIES =
  /@\/lib\/metadata\/(field-engine|entity-registry|relationship-registry|schema-registry)/;

/** The index import that runs bootstrapMetadata(). */
const BOOTSTRAP = /(?:import\s+"@\/lib\/metadata"|from\s+"@\/lib\/metadata")/;

/**
 * The index itself and its own sub-registries are exempt: they are what the
 * bootstrap is built from, so importing it there would be circular.
 */
const EXEMPT = new Set([
  "metadata/index.ts",
  "metadata/field-engine.ts",
  "metadata/entity-registry.ts",
  "metadata/relationship-registry.ts",
  "metadata/schema-registry.ts",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("IDXF metadata bootstrap", () => {
  const consumers = walk(LIB)
    .map((f) => ({ path: f, rel: relative(LIB, f), src: readFileSync(f, "utf8") }))
    .filter((f) => SUB_REGISTRIES.test(f.src))
    .filter((f) => !EXEMPT.has(f.rel));

  test("there are consumers to check", () => {
    // Guards against the walk silently finding nothing and the suite passing
    // vacuously if the directory layout changes.
    assert.ok(
      consumers.length >= 10,
      `expected to find metadata consumers under src/lib, found ${consumers.length}`
    );
  });

  test("every metadata consumer imports the bootstrap index", () => {
    const missing = consumers.filter((f) => !BOOTSTRAP.test(f.src)).map((f) => f.rel);

    assert.deepEqual(
      missing,
      [],
      `These modules read the IDXF registries but never import "@/lib/metadata", so they ` +
        `depend on load order:\n  ${missing.join("\n  ")}\n` +
        `Add: import "@/lib/metadata";`
    );
  });

  test("the bootstrap index is not imported by the registries it builds", () => {
    // A cycle here would break initialisation in a way that is hard to trace.
    for (const rel of Array.from(EXEMPT)) {
      if (rel === "metadata/index.ts") continue;
      const src = readFileSync(join(LIB, rel), "utf8");
      assert.ok(
        !BOOTSTRAP.test(src),
        `${rel} imports the bootstrap index, which is circular — the index is built from it`
      );
    }
  });
});

describe("IDXF registry is populated on import", () => {
  test("bootstrap registers the expected entities", async () => {
    const { getAllEntities } = await import("@/lib/metadata/entity-registry");
    await import("@/lib/metadata");

    const keys = getAllEntities().map((e) => e.key).sort();
    // Asserts the bootstrap actually ran rather than merely that the file
    // imported cleanly.
    assert.ok(keys.length > 0, "registry is empty after importing the bootstrap index");
    for (const expected of ["customer", "provider", "job", "payment"]) {
      assert.ok(keys.includes(expected), `expected '${expected}' to be registered, got: ${keys.join(", ")}`);
    }
  });
});
