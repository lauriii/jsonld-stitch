// Proves with the reference JSON-LD processor (jsonld.js) that the blocks ldgraph renders across
// layouts and pages form one dataset. Input is real HTML: pages the example app served from
// `next build` (saved in test/fixtures/app-router; test/e2e.test.ts checks they are still what the
// build serves) and the README's own example, bundled and rendered here. No browser, no network.
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToString } from "react-dom/server";
import { rolldown } from "rolldown";
import { beforeAll, describe, expect, it } from "vitest";
import { serialize } from "../src/index.ts";
import { blocksIn, canonicalNQuads, FIXTURES, prove, S, strict, type Json, type Proof } from "./jsonld-proof.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SITE = "https://example.com";
const ORG = `${SITE}/#organization`;
const WEBSITE = `${SITE}/#website`;
const saved = (file: string) => readFileSync(join(ROOT, "test", "fixtures", "app-router", file), "utf8");
const ids = (v: unknown) => (Array.isArray(v) ? v : [v]).map((x) => (x as Json)["@id"]);

// Blocks per route, as the e2e test expects the build to serve them.
const BLOCKS: Record<string, number> = {
  "/": 2,
  "/blog": 2,
  "/blog/hello": 3,
  "/blog/streamed": 3,
  "/shop/widget": 3,
  "/split": 4,
  "/about": 1,
  "/broken": 2,
};

const proofs = new Map<string, Proof>();
beforeAll(async () => {
  for (const [path, file] of Object.entries(FIXTURES)) proofs.set(path, await prove(saved(file), SITE + path));
});
const proof = (path: string) => proofs.get(path)!;

describe.each(Object.keys(FIXTURES))("%s, as served by next build", (path) => {
  it("is one dataset: split nodes keep every property, and it equals the same nodes in one block", () => {
    const p = proof(path);
    expect(p.blocks).toHaveLength(BLOCKS[path]!);
    expect(p.lost).toEqual([]);
    expect(p.dataset).toBe(p.control);
    expect(p.dataset).not.toBe("");
  });

  it("resolves every ref to a node with a @type", () => {
    // /broken is the negative control: its ref to #nobody has nothing to resolve to.
    expect(proof(path).unresolved).toEqual(path === "/broken" ? [`${SITE}/#nobody`] : []);
  });

  it("read by the literal extractAllScripts algorithm: one blank-named graph per block, same triples", () => {
    const { strict } = proof(path);
    expect(strict.namedGraphs).toBe(BLOCKS[path]);
    expect(strict.defaultQuads).toBe(0);
    expect(strict.merged).toBe(proof(path).control);
  });
});

describe("what the processor reads", () => {
  it("/split: one Product node with the properties of all three blocks", async () => {
    const p = proof("/split");
    const product = `${SITE}/split#product`;
    expect(p.split).toEqual([product]);
    const node = p.nodes.get(product)!;
    expect(node["@type"]).toEqual([`${S}Product`]);
    expect(Object.keys(node).sort()).toEqual(
      ["@id", "@type", ...["aggregateRating", "brand", "image", "name", "offers", "review", "url"].map((k) => S + k)].sort(),
    );
    expect(ids(node[`${S}brand`])).toEqual([ORG]);
    expect((node[`${S}review`] as unknown[]).length).toBe(2);
    // The control really is one node: serialize merged the three definitions into one object.
    const one = JSON.parse(serialize(p.blocks.flatMap((b) => (b as Json)["@graph"] as Json[]) as never))["@graph"] as Json[];
    expect(one.filter((n) => n["@id"] === product)).toHaveLength(1);
    expect(Object.keys(one.find((n) => n["@id"] === product)!)).toEqual(
      expect.arrayContaining(["name", "aggregateRating", "offers", "review"]),
    );
  });

  it("/blog/hello: the page's BlogPosting reaches the Organization and WebSite in the root layout's block", () => {
    const p = proof("/blog/hello");
    const blockOf = (id: string) => p.blocks.findIndex((b) => ((b as Json)["@graph"] as Json[]).some((n) => n["@id"] === id));
    const article = p.nodes.get(`${SITE}/blog/hello#article`)!;
    expect([blockOf(ORG), blockOf(`${SITE}/blog#blog`), blockOf(`${SITE}/blog/hello#article`)]).toEqual([0, 1, 2]);
    expect(ids(article[`${S}publisher`])).toEqual([ORG]);
    expect(ids(article[`${S}isPartOf`])).toEqual([`${SITE}/blog#blog`]);
    const org = p.nodes.get(ORG)!;
    expect(org["@type"]).toEqual([`${S}Organization`]);
    expect(org[`${S}name`]).toEqual([{ "@value": "Example" }]);
    expect(ids(p.nodes.get(`${SITE}/blog#blog`)![`${S}isPartOf`])).toEqual([WEBSITE]);
  });

  it("/about (one block) and / (root layout block) describe the site nodes identically", () => {
    for (const id of [ORG, WEBSITE]) expect(proof("/about").nodes.get(id)).toEqual(proof("/").nodes.get(id));
  });

  it("/broken: a relative @id resolves against the page URL", () => {
    expect(proof("/broken").nodes.has(`${SITE}/broken#broken`)).toBe(true);
  });
});

// The W3C JSON-LD 1.1 test suite pins down the literal algorithm: html/r004 (toRdf, extractAllScripts),
// https://w3c.github.io/json-ld-api/tests/html/r004-in.html and r004-out.nq (W3C test suite license).
describe("the extractAllScripts reading, against the W3C test suite", () => {
  const R004_IN = `<html><head>
<script type="application/ld+json">{"@context":{"foo":{"@id":"http://example.com/foo","@container":"@list"}},"foo":[{"@value":"bar"}]}</script>
<script type="application/ld+json">{"@context":{"ex":"http://example.com/"},"@graph":[{"ex:foo":{"@value":"foo"}},{"ex:bar":{"@value":"bar"}}]}</script>
</head></html>`;
  const R004_OUT = `_:b3 <http://example.com/foo> "foo" _:b2 .
_:b4 <http://example.com/bar> "bar" _:b2 .
_:b1 <http://www.w3.org/1999/02/22-rdf-syntax-ns#first> "bar" .
_:b1 <http://www.w3.org/1999/02/22-rdf-syntax-ns#rest> <http://www.w3.org/1999/02/22-rdf-syntax-ns#nil> .
_:b0 <http://example.com/foo> _:b1 .
`;

  it("reproduces html/r004: a script's {@context, @graph} becomes a graph named by a blank node", async () => {
    const read = await strict(blocksIn(R004_IN), "http://example.com/");
    expect(read.nquads).toBe(await canonicalNQuads(R004_OUT));
    expect(read.namedGraphs).toBe(1);
  });

  it("a block whose content is an array of nodes, each with its @context, stays in the default graph", async () => {
    const node = (n: Json) => `<script type="application/ld+json">${JSON.stringify([{ "@context": "https://schema.org", ...n }])}</script>`;
    const html = `<html><head>${node({ "@type": "Organization", "@id": ORG, name: "Example" })}</head><body>${node({
      "@type": "WebSite",
      "@id": WEBSITE,
      publisher: { "@id": ORG },
    })}</body></html>`;
    const read = await strict(blocksIn(html), `${SITE}/`);
    expect(read.namedGraphs).toBe(0);
    expect(read.nquads).toBe(read.merged);
    expect((await prove(html, `${SITE}/`)).dataset).toBe(read.nquads);
  });
});

/**
 * The README's example, run as written: its `lib/graph.ts`, `app/layout.tsx` and
 * `app/blog/[slug]/page.tsx` blocks are bundled (with a stub `@/lib/posts`) and rendered.
 */
async function readmeHtml(): Promise<string> {
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  const files = new Map<string, string>();
  for (const m of readme.matchAll(/```tsx?\n\/\/ ([\w/.[\]-]+\.tsx?)[^\n]*\n[\s\S]*?```/g)) files.set(m[1]!, m[0].replace(/^```tsx?\n|```$/g, ""));
  files.set("lib/posts.ts", `export async function getPost(slug: string) { return { title: "Hello, linked data", publishedAt: "2026-11-01", author: "Ada" }; }`);
  files.set("entry.tsx", `export { default as RootLayout } from "@/app/layout"; export { default as Post } from "@/app/blog/[slug]/page";`);
  for (const f of ["lib/graph.ts", "app/layout.tsx", "app/blog/[slug]/page.tsx"]) expect(files.has(f), `README block // ${f}`).toBe(true);

  const require = createRequire(join(ROOT, "package.json"));
  const virtual = (path: string) => [path, `${path}.ts`, `${path}.tsx`].find((p) => files.has(p));
  const build = await rolldown({
    input: "\0entry.tsx",
    logLevel: "silent",
    plugins: [
      {
        name: "readme",
        resolveId(id) {
          if (id === "\0entry.tsx") return id;
          if (id.startsWith("@/")) return `\0${virtual(id.slice(2))}`;
          if (id === "ldgraph") return join(ROOT, "src", "index.ts");
          if (/^react(-dom)?(\/|$)/.test(id)) return { id: require.resolve(id), external: true };
          return null;
        },
        load(id) {
          const file = id.startsWith("\0") ? id.slice(1) : undefined;
          return file && files.has(file) ? { code: files.get(file)!, moduleType: file.endsWith(".tsx") ? "tsx" : "ts" } : null;
        },
      },
    ],
  });
  const code = (await build.generate({ format: "esm", codeSplitting: false })).output[0].code;
  await build.close();
  const dir = mkdtempSync(join(tmpdir(), "ldgraph-readme-"));
  try {
    writeFileSync(join(dir, "readme.mjs"), code);
    const app = await import(/* @vite-ignore */ join(dir, "readme.mjs"));
    const page = await app.Post({ params: Promise.resolve({ slug: "hello" }) });
    return `<!doctype html>${renderToString(app.RootLayout({ children: page }))}`;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("the README's example", () => {
  let p: Proof;
  beforeAll(async () => {
    p = await prove(await readmeHtml(), `${SITE}/blog/hello`);
  }, 30_000);

  it("renders the root layout's block and the page's block", () => {
    expect(p.blocks.map((b) => ((b as Json)["@graph"] as Json[]).map((n) => n["@id"]))).toEqual([
      [ORG, WEBSITE],
      [`${SITE}/blog/hello#article`, `${SITE}/blog/hello#breadcrumb`],
    ]);
  });

  it("is one dataset equal to the one-block control, with every ref resolved", () => {
    expect(p.lost).toEqual([]);
    expect(p.unresolved).toEqual([]);
    expect(p.dataset).toBe(p.control);
    const article = p.nodes.get(`${SITE}/blog/hello#article`)!;
    expect(ids(article[`${S}publisher`])).toEqual([ORG]);
    expect(p.nodes.get(ORG)!["@type"]).toEqual([`${S}Organization`]);
    expect(ids(article[`${S}isPartOf`])).toEqual([WEBSITE]);
    expect(p.nodes.get(WEBSITE)!["@type"]).toEqual([`${S}WebSite`]);
  });

  it("read by the literal extractAllScripts algorithm: two blank-named graphs, same triples", () => {
    expect(p.strict).toMatchObject({ namedGraphs: 2, defaultQuads: 0 });
    expect(p.strict.merged).toBe(p.control);
  });
});
