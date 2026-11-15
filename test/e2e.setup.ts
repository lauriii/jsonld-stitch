// Runs once before the e2e file is collected: pack jsonld-stitch and install the tarball (plus NEXT_VERSION,
// when set) into examples/app-router, so the tests see the published shape and the right Next.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export default function setup(): void {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const tmp = mkdtempSync(join(tmpdir(), "jsonld-stitch-pack-"));
  const npm = (args: string[], cwd: string) => execFileSync("npm", args, { cwd, stdio: "pipe" });
  try {
    npm(["pack", "--pack-destination", tmp, "--silent"], root);
    const tarball = join(tmp, readdirSync(tmp).find((f) => f.endsWith(".tgz"))!);
    const next = process.env.NEXT_VERSION ? [`next@${process.env.NEXT_VERSION}`] : [];
    npm(["install", "--no-save", "--no-package-lock", "--no-audit", "--no-fund", tarball, ...next], join(root, "examples", "app-router"));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
