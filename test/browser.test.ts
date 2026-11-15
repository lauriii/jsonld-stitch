// <JsonLd> in a real browser: a block is application/ld+json exactly while React shows it.
// Bundles a tiny React 19 app with rolldown and runs it in Chromium (CHROMIUM_PATH, or
// `npx playwright-core install chromium`). Skips when no Chromium can be launched.
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright-core";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { rolldown } from "rolldown";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JsonLd } from "../src/index.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const GRAPH = { "@context": "https://schema.org", "@type": "Thing", "@id": "https://example.com/#t", name: "tab" };
const ACTIVE = "application/ld+json";
const INACTIVE = "text/x-ldgraph-inactive";

const ENTRY = `
import { createElement as h, Activity, Suspense, use, useState } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { JsonLd } from ${JSON.stringify(join(ROOT, "src", "index.ts"))};

const graph = ${JSON.stringify(GRAPH)};
const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));
const box = () => document.body.appendChild(document.createElement("div"));
const types = (div) => Array.from(div.querySelectorAll("script"), (s) => s.type);
let show;
function Tab({ initial }) {
  const [mode, setMode] = useState(initial);
  show = setMode;
  return h(Activity, { mode }, h(JsonLd, { graph }));
}
let suspend, release;
const pending = new Promise((r) => (release = r));
function Gate() {
  const [on, setOn] = useState(false);
  suspend = setOn;
  if (on) use(pending);
  return null;
}

window.scenarios = {
  // Mounted inside a hidden <Activity> (no effects run), then shown, then hidden again.
  async hiddenFirst() {
    const div = box();
    flushSync(() => createRoot(div).render(h(Tab, { initial: "hidden" })));
    await tick();
    const states = [types(div)];
    flushSync(() => show("visible"));
    await tick();
    states.push(types(div));
    flushSync(() => show("hidden"));
    await tick();
    states.push(types(div));
    return states;
  },
  // Shown, then hidden behind its Suspense fallback by an urgent update, then shown again.
  async resuspended() {
    const div = box();
    flushSync(() => createRoot(div).render(h(Suspense, { fallback: h("p", null, "…") }, h(JsonLd, { graph }), h(Gate))));
    await tick();
    const states = [types(div)];
    flushSync(() => suspend(true));
    await tick();
    states.push(types(div));
    release();
    await tick(600); // React throttles revealing a fallback's content by 300 ms
    states.push(types(div));
    return states;
  },
  // Server HTML hydrated in place.
  async hydrated(html) {
    const div = box();
    div.innerHTML = html;
    const before = types(div);
    hydrateRoot(div, h(JsonLd, { graph }));
    await tick(200);
    return [before, types(div), div.innerHTML === html];
  },
};
`;

let browser: Browser | undefined;
const bundles: Record<string, string> = {};

beforeAll(async () => {
  try {
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  } catch {
    return;
  }
  for (const env of ["production", "development"]) {
    const build = await rolldown({
      input: "entry.js",
      plugins: [{ name: "entry", resolveId: (id) => (id === "entry.js" ? id : null), load: (id) => (id === "entry.js" ? ENTRY : null) }],
      resolve: { modules: [join(ROOT, "node_modules")] },
      transform: { define: { "process.env.NODE_ENV": JSON.stringify(env) } },
      logLevel: "silent",
    });
    bundles[env] = (await build.generate({ format: "iife", codeSplitting: false })).output[0].code;
    await build.close();
  }
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

/** Runs one scenario in a fresh page and returns its result plus every console error or warning. */
async function run(env: string, name: string, arg?: string): Promise<{ result: unknown; console: string[] }> {
  const page: Page = await browser!.newPage();
  const messages: string[] = [];
  page.on("console", (m) => ["error", "warning"].includes(m.type()) && messages.push(m.text()));
  page.on("pageerror", (e) => messages.push(e.message));
  try {
    await page.setContent("<!doctype html><html><head></head><body></body></html>");
    await page.addScriptTag({ content: bundles[env]! });
    const result = await page.evaluate(
      ([n, a]) => (window as unknown as { scenarios: Record<string, (a?: string) => Promise<unknown>> }).scenarios[n!]!(a),
      [name, arg],
    );
    return { result, console: messages };
  } finally {
    await page.close();
  }
}

describe.each(["production", "development"])("in the browser (%s)", (env) => {
  it("keeps a block that mounts hidden inactive until it is shown", async (ctx) => {
    if (!browser) return ctx.skip();
    const { result, console } = await run(env, "hiddenFirst");
    expect(result).toEqual([[INACTIVE], [ACTIVE], [INACTIVE]]);
    expect(console).toEqual([]);
  });

  it("deactivates a block while a Suspense fallback hides it again", async (ctx) => {
    if (!browser) return ctx.skip();
    const { result, console } = await run(env, "resuspended");
    expect(result).toEqual([[ACTIVE], [INACTIVE], [ACTIVE]]);
    expect(console).toEqual([]);
  });

  it("hydrates the server's block as it is, without a mismatch warning", async (ctx) => {
    if (!browser) return ctx.skip();
    const html = renderToString(createElement(JsonLd, { graph: GRAPH }));
    expect(html).toContain(`type="${ACTIVE}"`);
    const { result, console } = await run(env, "hydrated", html);
    expect(result).toEqual([[ACTIVE], [ACTIVE], true]);
    expect(console).toEqual([]);
  });
});
