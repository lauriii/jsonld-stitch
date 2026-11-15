import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, expect, it } from "vitest";

// Budgets for what can reach a browser bundle, measured without comments (bundlers drop them).
// lint.js and check.js are left out: lint.js loads only in dev (behind NODE_ENV), check.js is for tests.
let out: string;
const gz = (...files: string[]) => files.reduce((n, f) => n + gzipSync(readFileSync(join(out, f))).length, 0);

beforeAll(() => {
  out = mkdtempSync(join(tmpdir(), "ldgraph-size-"));
  execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.build.json", "--outDir", out, "--removeComments"]);
}, 60_000);
afterAll(() => rmSync(out, { recursive: true, force: true }));

it("keeps the client component under 600 B gzipped", () => {
  expect(gz("script.js")).toBeLessThan(600);
});

it("keeps index + serialize + script under 1.5 kB gzipped", () => {
  expect(gz("index.js", "serialize.js", "script.js")).toBeLessThan(1500);
});
