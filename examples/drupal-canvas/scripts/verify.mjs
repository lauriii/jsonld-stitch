// Checks the running app against the content API, path by path:
//   - every JSON-LD block in the served HTML parses back to exactly the API's head.script documents;
//   - no block contains a raw "<", ">" or "&", and text that has them survives the round trip;
//   - ldgraph/check finds no issues on the page;
//   - the API's title, meta and link tags are in the HTML.
// Usage: CANVAS_CONTENT_API_BASE=https://cms.example.com npm run verify -- / /about
// APP (default http://localhost:3000) is the running app; OUT, if set, is where to save each page's
// HTML and a JSON comparison.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { check } from "ldgraph/check";

const base = process.env.CANVAS_CONTENT_API_BASE?.replace(/\/+$/, "");
const app = (process.env.APP ?? "http://localhost:3000").replace(/\/+$/, "");
const out = process.env.OUT;
const paths = process.argv.slice(2);
if (!base || paths.length === 0) {
  console.error("Usage: CANVAS_CONTENT_API_BASE=<origin> node scripts/verify.mjs <path>...");
  process.exit(2);
}
if (out) mkdirSync(out, { recursive: true });

// The escaping keeps "<" out of a block, so its first "</script>" is its end.
const BLOCK = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

let failed = 0;
for (const path of paths) {
  const api = await (await fetch(`${base}/canvas/content-api?requestUri=${encodeURIComponent(path)}`)).json();
  const html = await (await fetch(`${app}${path}`)).text();
  const expected = (api.head?.script ?? [])
    .filter((s) => s.type === "application/ld+json")
    .map((s) => (typeof s.textContent === "string" ? JSON.parse(s.textContent) : s.textContent));
  const raw = [...html.matchAll(BLOCK)].map((m) => m[1]);
  const actual = raw.map((r) => JSON.parse(r));

  const head = api.head ?? {};
  const attrs = (tag) => [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, "g"))].map((m) => decode(m[0]));
  const metas = attrs("meta");
  const links = attrs("link");
  const titles = [...html.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => decode(m[1]));
  const missingHead = [
    ...(head.title && !titles.includes(head.title) ? [`title ${head.title}`] : []),
    ...(head.meta ?? [])
      .filter((m) => !metas.some((t) => t.includes(`${m.name ? "name" : "property"}="${m.name ?? m.property}"`) && t.includes(`content="${m.content}"`)))
      .map((m) => `meta ${m.name ?? m.property}`),
    ...(head.link ?? []).filter((l) => !links.some((t) => t.includes(`rel="${l.rel}"`) && t.includes(`href="${l.href}"`))).map((l) => `link ${l.rel}`),
  ];

  const result = {
    path,
    blocks: { expected: expected.length, actual: actual.length },
    graphEqual: isDeepStrictEqual(actual, expected),
    rawUnsafeChars: raw.some((r) => [...r].some((c) => "<>&".includes(c) || c.charCodeAt(0) === 0x2028 || c.charCodeAt(0) === 0x2029)),
    specialStrings: JSON.stringify(expected).match(/"[^"]*[<>&][^"]*"/g) ?? [],
    checkIssues: check(html),
    missingHead,
  };
  const ok = result.graphEqual && !result.rawUnsafeChars && result.checkIssues.length === 0 && missingHead.length === 0;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${path}  blocks=${actual.length} equal=${result.graphEqual} issues=${result.checkIssues.length} head-missing=${missingHead.length} special-strings=${result.specialStrings.length}`);

  if (out) {
    const name = path === "/" ? "index" : path.slice(1).replace(/\//g, "_");
    writeFileSync(join(out, `${name}.html`), html);
    writeFileSync(join(out, `${name}.comparison.json`), JSON.stringify({ ...result, ok, expected, actual }, null, 2));
  }
}
process.exit(failed ? 1 : 0);
