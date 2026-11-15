// What the reference JSON-LD processor (jsonld.js, https://github.com/digitalbazaar/jsonld.js) reads
// from a page's HTML: every application/ld+json block, read the two ways the spec allows. Shared by
// test/jsonld.test.ts (saved HTML) and test/e2e.test.ts (the live build). Offline: the schema.org
// context is the copy in test/fixtures (fetched from https://schema.org/docs/jsonldcontext.jsonld).
import { readFileSync } from "node:fs";
import jsonldModule from "jsonld";
import { parse } from "parse5";
import { serialize } from "../src/index.ts";

export type Json = Record<string, unknown>;
type Quad = { graph: { termType: string; value: string } };

/** schema.org's vocabulary IRI in its own context (`@vocab` is http, whatever the page writes). */
export const S = "http://schema.org/";

const CONTEXT: unknown = JSON.parse(readFileSync(new URL("fixtures/schema.org-context.jsonld", import.meta.url), "utf8"));

// The typings lag the library (no `safe`, loose results), so describe the calls used here.
const jsonld = jsonldModule as unknown as {
  expand(input: unknown, options: object): Promise<Json[]>;
  flatten(input: unknown, context: null, options: object): Promise<Json[]>;
  toRDF(input: unknown, options: object): Promise<Quad[]>;
  canonize(input: unknown, options: object): Promise<string>;
};

const documentLoader = async (url: string) => {
  if (/^https?:\/\/schema\.org\/?$/.test(url)) return { contextUrl: null, documentUrl: url, document: CONTEXT };
  throw new Error(`offline: refusing to load ${url}`);
};
// Safe mode makes the processor fail instead of silently dropping data (e.g. an @id it cannot resolve).
// schema.org's @vocab maps any term, so it does not catch a misspelt property: schema-dts does that.
const options = (base: string) => ({ base, documentLoader, safe: true });

/** The canonical N-Quads (RDFC-1.0) of `input`: equal strings mean the same RDF dataset. */
export const canonical = (input: unknown, base: string): Promise<string> =>
  jsonld.canonize(input, { ...options(base), algorithm: "RDFC-1.0", format: "application/n-quads" });

type El = { nodeName: string; attrs?: { name: string; value: string }[]; childNodes?: El[]; value?: string };

/**
 * The parsed content of every JSON-LD script element, as a browser's parser finds them (parse5 is a
 * spec-compliant HTML parser; `<template>` content is not in the tree, as in a browser).
 */
export function blocksIn(html: string): unknown[] {
  const out: unknown[] = [];
  const walk = (node: El): void => {
    const type = node.attrs?.find((a) => a.name === "type")?.value.trim().toLowerCase();
    if (node.nodeName === "script" && type === "application/ld+json") {
      out.push(JSON.parse((node.childNodes ?? []).map((c) => c.value ?? "").join("")));
    }
    node.childNodes?.forEach(walk);
  };
  walk(parse(html) as unknown as El);
  return out;
}

const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const values = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]);
const key = (v: unknown): string => JSON.stringify(v, (_, x) => (isObj(x) ? Object.fromEntries(Object.entries(x).sort()) : x));

/** Every `{ "@id" }`-only object in a block: what `ref()` renders. */
function refsIn(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => refsIn(v, out));
  else if (isObj(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === "@id" && typeof value["@id"] === "string") out.push(value["@id"]);
    else for (const k of keys) if (k !== "@context") refsIn(value[k], out);
  }
  return out;
}

export type Proof = {
  /** The parsed blocks, in document order. */
  blocks: unknown[];
  /**
   * The page as one dataset, read the way JSON-LD 1.1 §7.3 describes ("all script elements … MUST
   * be processed and merged into a single dataset"): each block expanded on its own, so its top-level
   * `@graph` is the default graph, and the results concatenated. Canonical N-Quads.
   */
  dataset: string;
  /** The same nodes in one block (`serialize` of every block's nodes: the README's one-block page). */
  control: string;
  /** The flattened page, by `@id`: one entry per node, however many blocks describe it. */
  nodes: Map<string, Json>;
  /** The `@id`s that more than one block gives properties to. */
  split: string[];
  /** `id property` for each property a block gives a node that the merged node lacks. Should be []. */
  lost: string[];
  /** Each `{ "@id" }` reference whose target has no `@type` on the page (the target is resolved to absolute). */
  unresolved: string[];
  /**
   * The literal API algorithm (JSON-LD 1.1 API §9.4.1 with extractAllScripts, the shape the W3C test
   * html/r004 pins down): the blocks are put in one array and expanded together, so a block's
   * `{"@context","@graph"}` keeps its `@graph` and becomes a graph named by a blank node.
   */
  strict: {
    /** How many distinct named graphs the quads are in. */
    namedGraphs: number;
    /** How many quads land in the default graph. */
    defaultQuads: number;
    /** Canonical N-Quads after merging every named graph into the default graph. */
    merged: string;
  };
};

export async function prove(html: string, base: string): Promise<Proof> {
  const blocks = blocksIn(html);
  const expanded = (await Promise.all(blocks.map((b) => jsonld.expand(b, options(base))))).flat();
  const dataset = await canonical(expanded, base);
  const control = await canonical(JSON.parse(serialize(blocks.flatMap((b) => (isObj(b) ? values(b["@graph"] ?? b) : b)) as never)), base);

  const flat = await jsonld.flatten(expanded, null, options(base));
  const nodes = new Map(flat.map((n) => [n["@id"] as string, n]));

  // Each block flattened on its own: every property it gives a named node must be on the merged node.
  const givers = new Map<string, number>();
  const lost: string[] = [];
  for (const block of blocks) {
    for (const node of await jsonld.flatten(block, null, options(base))) {
      const id = node["@id"] as string;
      if (id.startsWith("_:")) continue;
      const props = Object.keys(node).filter((k) => k !== "@id");
      if (props.length) givers.set(id, (givers.get(id) ?? 0) + 1);
      const merged = nodes.get(id) ?? {};
      for (const p of props) {
        const have = values(merged[p]);
        const blanks = (vs: unknown[]) => vs.filter((v) => isObj(v) && String(v["@id"]).startsWith("_:")).length;
        const want = values(node[p]);
        // Blank nodes are relabelled per flatten, so compare those by count and everything else by value.
        const missing = want.some((v) => !(isObj(v) && String(v["@id"]).startsWith("_:")) && !have.some((h) => key(h) === key(v)));
        if (missing || blanks(have) < blanks(want)) lost.push(`${id} ${p}`);
      }
    }
  }
  const split = [...givers].filter(([, n]) => n > 1).map(([id]) => id);

  const unresolved = blocks
    .flatMap((b) => refsIn(b))
    .map((id) => (id.startsWith("_:") ? id : new URL(id, base).href))
    .filter((id) => values(nodes.get(id)?.["@type"]).length === 0);

  return { blocks, dataset, control, nodes, split, lost, unresolved, strict: await strict(blocks, base) };
}

/** JSON-LD 1.1 API §9.4.1, extractAllScripts: each block's content appended to one array, then processed. */
export async function strict(blocks: unknown[], base: string): Promise<Proof["strict"] & { nquads: string }> {
  const document = blocks.flatMap((b) => (Array.isArray(b) ? b : [b]));
  const quads = await jsonld.toRDF(document, options(base));
  const expanded = await jsonld.expand(document, options(base));
  return {
    nquads: await canonical(document, base),
    namedGraphs: new Set(quads.filter((q) => q.graph.termType !== "DefaultGraph").map((q) => q.graph.value)).size,
    defaultQuads: quads.filter((q) => q.graph.termType === "DefaultGraph").length,
    // A graph object with nothing but @graph contributes only its nodes: lift them into the default graph.
    merged: await canonical(
      expanded.flatMap((e) => (Object.keys(e).length === 1 && "@graph" in e ? values(e["@graph"]) : [e])),
      base,
    ),
  };
}

/** Canonical N-Quads of an N-Quads string, to compare it with `canonical()` output. */
export const canonicalNQuads = (nquads: string): Promise<string> =>
  jsonld.canonize(nquads, { inputFormat: "application/n-quads", algorithm: "RDFC-1.0", format: "application/n-quads", safe: true });

/** The routes whose served HTML is saved in test/fixtures/app-router (refreshed by the e2e run). */
export const FIXTURES: Record<string, string> = {
  "/": "home.html",
  "/blog": "blog.html",
  "/blog/hello": "blog-hello.html",
  "/blog/streamed": "blog-streamed.html",
  "/shop/widget": "shop-widget.html",
  "/split": "split.html",
  "/about": "about.html",
  "/broken": "broken.html",
};
