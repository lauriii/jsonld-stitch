import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("publishes only dist, src, the README, the license and package.json", () => {
  // Runs prepack, so dist is freshly built.
  const [pack] = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--silent"], { encoding: "utf8" }));
  const files = (pack.files as { path: string }[]).map((f) => f.path).sort();
  const modules = ["check", "index", "lint", "script", "serialize", "types"];
  expect(files).toEqual(
    [
      "LICENSE",
      "README.md",
      "package.json",
      ...modules.flatMap((m) => [`dist/${m}.js`, `dist/${m}.d.ts`, `dist/${m}.d.ts.map`, `src/${m}.ts`]),
    ].sort(),
  );
}, 60_000);
