import type { Nodes } from "./types.js";

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isSchemaOrg = (ctx: unknown): boolean => typeof ctx === "string" && /^https?:\/\/schema\.org\/?$/.test(ctx);

// The characters that can end or confuse a <script> data block (`</script`, `<!--`, `]]>`), plus the
// two line terminators that are valid in JSON but not in older JavaScript. They can only occur inside
// JSON strings, where the escape `\u003c` decodes back to `<`, so escaping them is lossless.
const UNSAFE = /[<>&\u2028\u2029]/g;
const escape = (c: string): string => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0");

/**
 * Expands arrays and `@graph` documents into a flat list of node objects, drops non-objects
 * (`null`, `undefined`, `false`), and removes a `@context` that is just schema.org. A document's
 * other `@context` moves down onto its nodes, so no context is ever lost. Never mutates its input.
 */
export function flatten(graph: unknown, context?: unknown, out: Obj[] = []): Obj[] {
  if (Array.isArray(graph)) {
    for (const item of graph) flatten(item, context, out);
  } else if (isObj(graph)) {
    const { "@context": own, ...node } = graph;
    const ctx = own ?? context;
    if ("@graph" in node) flatten(node["@graph"], ctx, out);
    else out.push(ctx === undefined || isSchemaOrg(ctx) ? node : { "@context": ctx, ...node });
  }
  return out;
}

/** Nodes that share an `@id` become one, where the first appeared. Properties union; first value wins. */
function merge(nodes: Obj[]): Obj[] {
  const out: Obj[] = [];
  const byId = new Map<string, Obj>();
  for (const node of nodes) {
    const id = node["@id"];
    const first = typeof id === "string" ? byId.get(id) : undefined;
    if (!first) {
      out.push(node);
      if (typeof id === "string") byId.set(id, node);
    } else {
      for (const key of Object.keys(node)) if (first[key] === undefined) first[key] = node[key];
    }
  }
  return out;
}

/** Serializes flattened nodes (from `flatten`, which owns them) into a safe JSON-LD block. */
export function stringify(nodes: Obj[]): string {
  return JSON.stringify({ "@context": "https://schema.org", "@graph": merge(nodes) }).replace(UNSAFE, escape);
}

/**
 * Turns a graph into the text of a `<script type="application/ld+json">` block:
 * `{"@context":"https://schema.org","@graph":[...]}`, merged by `@id` and escaped so that it can
 * never end the script element. `JSON.parse` of the result gives back exactly the input data.
 */
export function serialize(graph: Nodes): string {
  return stringify(flatten(graph));
}
