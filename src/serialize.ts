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
 * (`null`, `undefined`, `false`, `""`, `0`), and removes a `@context` that is just schema.org. A
 * document's other `@context` moves down onto its nodes, so no context is ever lost. An object with
 * a `@graph` and properties of its own stays a node, before its graph's nodes. Never mutates its input.
 * Truthy non-objects (a string, `true`, a number) are dropped too, and collected in `skipped` if given.
 */
export function flatten(graph: unknown, skipped?: unknown[]): Obj[] {
  const out: Obj[] = [];
  const walk = (value: unknown, context: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item, context);
    } else if (isObj(value)) {
      const { "@context": own, "@graph": inner, ...node } = value;
      const ctx = own ?? context;
      if (inner === undefined || Object.keys(node).some((k) => k !== "@id" && node[k] !== undefined))
        out.push(ctx === undefined || isSchemaOrg(ctx) ? node : { "@context": ctx, ...node });
      walk(inner, ctx);
    } else if (value) {
      skipped?.push(value);
    }
  };
  walk(graph, undefined);
  return out;
}

/**
 * Nodes that share an `@id` and a `@context` become one, where the first appeared: properties union,
 * the first value wins. Under different contexts the same keys mean different things, so those stay apart.
 */
function merge(nodes: Obj[]): Obj[] {
  const out: Obj[] = [];
  const byKey = new Map<string, Obj>();
  for (const node of nodes) {
    const id = node["@id"];
    const key = typeof id === "string" ? JSON.stringify([id, node["@context"]]) : "";
    const first = byKey.get(key);
    if (!first) {
      out.push(node);
      if (key) byKey.set(key, node);
    } else {
      for (const k of Object.keys(node)) if (first[k] === undefined) first[k] = node[k];
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
 * never end the script element. The escaping is lossless: `JSON.parse` gives back the merged nodes
 * exactly as `JSON.stringify` wrote them.
 */
export function serialize(graph: Nodes): string {
  return stringify(flatten(graph));
}
