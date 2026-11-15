// The rules behind check() and the dev warnings. Internal: not part of the package's exports.
import type { Issue, Rule } from "./types.js";

type Obj = Record<string, unknown>;
export type Root = { querySelectorAll(selector: string): ArrayLike<{ textContent: string | null }> };

/** Rules that need only one block's nodes: `JsonLd` runs them on the server, in dev. */
export const SERVER: readonly Rule[] = ["relative-id", "conflict", "product", "breadcrumb"];
/** Rules that need the whole page: `Script` runs them in the browser, in dev. */
export const BROWSER: readonly Rule[] = ["invalid-json", "missing-context", "missing-type", "dangling-ref", "conflict"];
export const ALL: readonly Rule[] = [...new Set([...SERVER, ...BROWSER])];

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]);
const types = (node: Obj): unknown[] => list(node["@type"]);
const short = (v: unknown): string => {
  const s = JSON.stringify(v) ?? String(v);
  return s.length > 60 ? s.slice(0, 57) + "..." : s;
};
// JSON with sorted keys, so two values that differ only in key order compare equal.
const canon = (v: unknown): string =>
  JSON.stringify(v, (_, x: unknown) =>
    isObj(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x,
  );
// The site an http(s) IRI belongs to. Other schemes (urn:, _:) never count as dangling.
const origin = (iri: string): string | undefined => {
  try {
    const url = new URL(iri);
    return /^https?:$/.test(url.protocol) ? url.origin : undefined;
  } catch {
    return undefined;
  }
};

/** The text of every active JSON-LD block under `root`. Inactive (hidden-route) blocks have another type. */
export const blocksOf = (root: Root): string[] =>
  Array.from(root.querySelectorAll('script[type="application/ld+json" i]'), (s) => s.textContent ?? "");

/**
 * Runs `rules` over the blocks of one page. A block is JSON text, or an already parsed JSON value.
 * Nodes that share an `@id` are merged across blocks first, as a JSON-LD processor would.
 */
export function lint(blocks: readonly unknown[], rules: readonly Rule[]): Issue[] {
  const on = new Set(rules);
  const issues: Issue[] = [];
  const add = (rule: Rule, message: string, id?: string): void => {
    if (on.has(rule)) issues.push(id === undefined ? { rule, message } : { rule, message, id });
  };
  const defined = new Map<string, Obj>();
  const refs: { id: string; from: string }[] = [];
  const anonymous: { node: Obj; label: string }[] = [];

  const walk = (node: Obj, at: string, parentKey: string): void => {
    const id = node["@id"];
    const keys = Object.keys(node);
    const name = typeof id === "string" ? id : at;
    if (typeof id === "string") {
      if (!id.startsWith("_:") && !/^[a-z][a-z\d+.-]*:/i.test(id)) add("relative-id", at === id ? id : `${id} (from ${at})`, id);
      if (keys.length === 1) refs.push({ id, from: at });
      else {
        const merged = defined.get(id) ?? defined.set(id, {}).get(id)!;
        for (const key of keys) {
          if (merged[key] === undefined) merged[key] = node[key];
          else if (canon(merged[key]) !== canon(node[key]))
            add("conflict", `${id} ${key}: ${short(merged[key])} vs ${short(node[key])}`, id);
        }
      }
    } else if (node["@type"] !== undefined && parentKey !== "itemOffered") {
      anonymous.push({ node, label: at });
    }
    for (const key of keys) {
      if (key === "@context") continue;
      list(node[key]).forEach((value, i, all) => {
        if (isObj(value)) walk(value, all.length > 1 ? `${name}.${key}[${i}]` : `${name}.${key}`, key);
      });
    }
  };

  blocks.forEach((block, b) => {
    const where = blocks.length > 1 ? ` in block ${b + 1}` : "";
    let value = block;
    if (typeof block === "string") {
      try {
        value = JSON.parse(block);
      } catch (e) {
        add("invalid-json", `block ${b + 1}: ${(e as Error).message}`);
        return;
      }
    }
    // Top-level nodes: expand arrays and @graph documents, tracking whether a @context applies.
    const top = (v: unknown, ctx: boolean): void => {
      if (Array.isArray(v)) v.forEach((item) => top(item, ctx));
      else if (isObj(v)) {
        const has = ctx || v["@context"] !== undefined;
        if (v["@graph"] !== undefined) return top(v["@graph"], has);
        const label = typeof v["@id"] === "string" ? v["@id"] : `${types(v).join(",") || "node"}${where}`;
        if (!has) add("missing-context", `${label} has no @context`, v["@id"] as string | undefined);
        if (v["@id"] === undefined && v["@type"] === undefined) add("missing-type", `a node${where} has neither @id nor @type`);
        walk(v, label, "");
      }
    };
    top(value, false);
  });

  for (const [id, node] of defined) if (node["@type"] === undefined) add("missing-type", `${id} has no @type`, id);

  const sites = new Set([...defined.keys()].map(origin));
  for (const { id, from } of refs) {
    if (!defined.has(id) && origin(id) !== undefined && sites.has(origin(id))) add("dangling-ref", `${id} (from ${from})`, id);
  }

  const subjects = [...[...defined].map(([id, node]) => ({ node, label: id })), ...anonymous];
  for (const { node, label } of subjects) {
    const id = typeof node["@id"] === "string" ? node["@id"] : undefined;
    const is = types(node);
    if (is.includes("Product")) {
      if (node["name"] === undefined) add("product", `${label} needs a name`, id);
      if (node["offers"] === undefined && node["review"] === undefined && node["aggregateRating"] === undefined)
        add("product", `${label} needs offers, review or aggregateRating`, id);
    }
    if (is.includes("BreadcrumbList")) {
      const items = list(node["itemListElement"]);
      if (!items.length) add("breadcrumb", `${label} has no itemListElement`, id);
      items.forEach((item, i) => {
        const it = isObj(item) ? item : {};
        const n = `${label} item ${i + 1}`;
        if (it["position"] === undefined) add("breadcrumb", `${n} needs a position`, id);
        if (it["name"] === undefined && !(isObj(it["item"]) && it["item"]["name"] !== undefined))
          add("breadcrumb", `${n} needs a name`, id);
        if (i < items.length - 1 && it["item"] === undefined) add("breadcrumb", `${n} needs an item URL`, id);
      });
    }
  }
  return issues;
}

const reported = new Set<string>();

/** Prints each issue once per process (server) or tab (browser). */
export function report(issues: readonly Issue[]): void {
  for (const { rule, message } of issues) {
    const line = `[ldgraph] ${rule}: ${message}`;
    if (!reported.has(line)) {
      reported.add(line);
      console.warn(line);
    }
  }
}
