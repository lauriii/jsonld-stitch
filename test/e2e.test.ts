// End to end, after test/e2e.setup.ts installed the packed tarball into examples/app-router: for
// each rendering mode run `next build` + `next start` and assert on the served HTML and on client navigation.
// Finally one `next dev` pass checks the dev warnings. One server and one browser at a time, on a
// random high port; every process is killed in afterAll.
//
// Env: NEXT_VERSION installs another Next into the example (e.g. 15.5); CHROMIUM_PATH points
// playwright-core at a Chromium binary (otherwise run `npx playwright-core install chromium`).
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Issue } from "../src/check.ts";
import { XSS } from "../examples/app-router/lib/data.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const APP = join(ROOT, "examples", "app-router");
const NEXT_BIN = join(APP, "node_modules", "next", "dist", "bin", "next");
const SITE = "https://example.com";
const UAS = {
  browser: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
};

// The blocks each route must serve, as the @ids in each block, in document order.
const ROOT_BLOCK = [`${SITE}/#organization`, `${SITE}/#website`];
const BLOG_BLOCK = [`${SITE}/blog#blog`];
const post = (path: string) => [`${SITE}${path}#article`, `${SITE}${path}#breadcrumb`];
const ROUTES: Record<string, string[][]> = {
  "/": [ROOT_BLOCK, [`${SITE}/#webpage`]],
  "/blog": [ROOT_BLOCK, BLOG_BLOCK],
  "/blog/hello": [ROOT_BLOCK, BLOG_BLOCK, post("/blog/hello")],
  "/blog/other": [ROOT_BLOCK, BLOG_BLOCK, post("/blog/other")],
  "/blog/dynamic": [ROOT_BLOCK, BLOG_BLOCK, post("/blog/dynamic")],
  "/blog/streamed": [ROOT_BLOCK, BLOG_BLOCK, post("/blog/streamed")],
  "/shop/widget": [ROOT_BLOCK, [`${SITE}/shop#collection`], [`${SITE}/shop/widget#product`, `${SITE}/shop/widget#breadcrumb`]],
  "/xss": [ROOT_BLOCK, post("/xss")],
  "/about": [[...ROOT_BLOCK, `${SITE}/about#webpage`]],
  "/legacy": [[...ROOT_BLOCK, `${SITE}/legacy#webpage`]],
};

type Block = { text: string; json: { "@context": string; "@graph": Record<string, unknown>[] }; index: number };
type Server = { url: string; log: () => string; stop: () => Promise<void> };

let check: (source: string) => Issue[];
let browser: Browser | undefined;
const nextMajor = (): number => Number(JSON.parse(readFileSync(join(APP, "node_modules", "next", "package.json"), "utf8")).version.split(".")[0]);

const blocksIn = (html: string): Block[] =>
  Array.from(html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g), (m) => ({
    text: m[1]!,
    json: JSON.parse(m[1]!),
    index: m.index,
  }));
const idsOf = (blocks: Pick<Block, "json">[]) => blocks.map((b) => b.json["@graph"].map((n) => n["@id"]));
const serverLines = (log: string): string => log.split("\n").filter((l) => !l.startsWith("[browser]")).join("\n");

function run(cmd: string, args: string[], cwd: string, env: Record<string, string> = {}): void {
  execFileSync(cmd, args, { cwd, stdio: "pipe", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", ...env } });
}

async function serve(args: string[], env: Record<string, string> = {}): Promise<Server> {
  const port = 40_000 + Math.floor(Math.random() * 20_000);
  let log = "";
  const child: ChildProcess = spawn(process.execPath, [NEXT_BIN, ...args, "-H", "127.0.0.1", "-p", String(port)], {
    cwd: APP,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", ...env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true, // its own process group, so stop() also ends next's workers
  });
  child.stdout!.on("data", (d) => (log += d));
  child.stderr!.on("data", (d) => (log += d));
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    try {
      process.kill(-child.pid!, "SIGTERM");
    } catch {}
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {}
    }, 5_000);
    await exited;
    clearTimeout(timer);
  };
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next ${args[0]} exited:\n${log}`);
    try {
      if ((await fetch(`${url}/blog`)).ok) return { url, log: () => log, stop };
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  await stop();
  throw new Error(`next ${args[0]} did not start:\n${log}`);
}

const fetchHtml = async (url: string, ua: string): Promise<string> => {
  const res = await fetch(url, { headers: { "user-agent": ua } });
  expect(res.status, url).toBe(200);
  return res.text();
};

/** The @ids of the active blocks in the live DOM, and how many blocks are inactive. */
const dom = (page: Page) =>
  page.evaluate(() => ({
    active: Array.from(document.querySelectorAll('script[type="application/ld+json"]'), (s) =>
      (JSON.parse(s.textContent ?? "")["@graph"] as { "@id": string }[]).map((n) => n["@id"]),
    ),
    inactive: document.querySelectorAll('script[type="text/x-ldgraph-inactive"]').length,
    marker: (window as unknown as { __marker?: string }).__marker,
  }));

beforeAll(async () => {
  // test/e2e.setup.ts installed the packed tarball: test with its check(), not the source.
  ({ check } = await import(pathToFileURL(join(APP, "node_modules", "ldgraph", "dist", "check.js")).href));
});

afterAll(async () => {
  await browser?.close();
});

it("installs the packed shape: the client file keeps its directive", () => {
  const script = readFileSync(join(APP, "node_modules", "ldgraph", "dist", "script.js"), "utf8");
  expect(script.startsWith('"use client";')).toBe(true);
});

const modes = nextMajor() >= 16 ? (["cache-components", "classic"] as const) : (["classic"] as const);

describe.each(modes)("next build + start (%s)", (mode) => {
  let server: Server;
  const env = { LDGRAPH_CC: mode === "classic" ? "0" : "1" };

  beforeAll(async () => {
    rmSync(join(APP, ".next"), { recursive: true, force: true });
    run(process.execPath, [NEXT_BIN, "build"], APP, env);
    server = await serve(["start"], env);
  });
  afterAll(async () => {
    await server?.stop();
  });

  for (const [ua, agent] of Object.entries(UAS)) {
    it.each(Object.keys(ROUTES))(`serves the expected blocks on %s (${ua})`, async (path) => {
      const html = await fetchHtml(server.url + path, agent);
      const blocks = blocksIn(html);
      expect(idsOf(blocks)).toEqual(ROUTES[path]);
      // Valid, safely escaped JSON-LD: nothing an HTML parser could end the block on.
      for (const block of blocks) {
        expect(block.text).not.toMatch(/[<>&\u2028\u2029]/);
        expect(block.json["@context"]).toBe("https://schema.org");
      }
      // No node is defined twice on a page, and every link resolves.
      const ids = blocks.flatMap((b) => b.json["@graph"].map((n) => n["@id"]));
      expect(new Set(ids).size).toBe(ids.length);
      expect(check(html)).toEqual([]);
      // Where a root layout renders a block, it lands in <head>.
      if (ROUTES[path]!.length > 1) expect(blocks[0]!.index).toBeLessThan(html.indexOf("</head>"));
    });
  }

  it("round-trips the XSS headline, and no payload reaches the HTML", async () => {
    const html = await fetchHtml(`${server.url}/xss`, UAS.browser);
    const article = blocksIn(html)[1]!.json["@graph"][0]!;
    expect(article["headline"]).toBe(XSS);
    expect(article["author"]).toEqual({ "@type": "Person", name: XSS });
    expect(html).not.toContain("<script>alert");
    expect(html.match(/<\/script/gi)?.length).toBe(html.match(/<script/gi)?.length);
  });

  it("reports exactly the broken fixture's issues", async () => {
    const html = await fetchHtml(`${server.url}/broken`, UAS.browser);
    expect(check(html)).toEqual([
      { rule: "relative-id", message: "#broken", id: "#broken" },
      { rule: "dangling-ref", message: `${SITE}/#nobody (from #broken.publisher)`, id: `${SITE}/#nobody` },
    ]);
  });

  it("ships no dev-check code to the browser", () => {
    const dir = join(APP, ".next", "static");
    const files = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".js"));
    const js = files.map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
    expect(js).toContain("text/x-ldgraph-inactive");
    expect(js).not.toContain("[ldgraph]");
    expect(js).not.toContain("dangling-ref");
  });

  it("keeps only the current route's blocks active across client navigation", async () => {
    browser ??= await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await browser.newPage();
    const problems: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" || /hydrat|\[ldgraph\]/i.test(m.text())) problems.push(m.text());
    });
    page.on("pageerror", (e) => problems.push(e.message));
    try {
      await page.goto(`${server.url}/`, { waitUntil: "networkidle" });
      await expect.poll(async () => (await dom(page)).active).toEqual(ROUTES["/"]);
      await page.evaluate(() => ((window as unknown as { __marker: string }).__marker = "same document"));

      const seen = new Set<string>(["/"]);
      for (const path of ["/blog/hello", "/blog/dynamic", "/shop/widget", "/"]) {
        await page.click(`nav a[href="${path}"]`);
        await page.waitForURL(server.url + path);
        await expect.poll(async () => (await dom(page)).active, { timeout: 15_000 }).toEqual(ROUTES[path]);
        const { inactive, marker } = await dom(page);
        expect(marker, "a client navigation, not a reload").toBe("same document");
        if (mode === "classic") {
          // No preserved routes: the DOM holds exactly the current blocks.
          expect(inactive).toBe(0);
        } else if (!seen.has(path)) {
          // Cache Components keeps previous routes hidden in the DOM: their blocks must be inactive.
          expect(inactive).toBeGreaterThan(0);
        }
        seen.add(path);
      }
      // Back on "/", its preserved block is active again and everything hidden is inactive.
      expect(problems).toEqual([]);
    } finally {
      await page.close();
    }
  });
});

describe("next dev", () => {
  let server: Server;
  beforeAll(async () => {
    server = await serve(["dev"]);
  });
  afterAll(async () => {
    await server?.stop();
  });

  const visit = async (path: string): Promise<string[]> => {
    browser ??= await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await browser.newPage();
    const messages: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" || /hydrat|\[ldgraph\]/i.test(m.text())) messages.push(m.text());
    });
    page.on("pageerror", (e) => messages.push(e.message));
    try {
      await page.goto(server.url + path, { waitUntil: "networkidle", timeout: 90_000 });
      await page.waitForTimeout(1_500); // the page check runs 500 ms after the last block mounts
      return messages;
    } finally {
      await page.close();
    }
  };

  it("warns about nothing on the example routes", async () => {
    for (const path of ["/", "/blog/hello", "/blog/streamed", "/shop/widget", "/about"]) {
      expect(await visit(path), path).toEqual([]);
    }
    expect(server.log()).not.toContain("[ldgraph]");
  });

  it("warns about the broken fixture: whole-page rules in the browser, block rules on the server", async () => {
    const messages = await visit("/broken");
    expect(messages.some((m) => m.includes(`[ldgraph] dangling-ref: ${SITE}/#nobody (from #broken.publisher)`))).toBe(true);
    expect(server.log()).toContain("[ldgraph] relative-id: #broken");
    // Next echoes browser logs into the terminal as "[browser] ..."; the server itself only warns about its rules.
    expect(serverLines(server.log())).not.toContain("dangling-ref");
  });
});
