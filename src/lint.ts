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
// A value as JSON-LD compares it: object keys in any order, arrays as sets, and `"A"` equal to `["A"]`.
const canon = (v: unknown): string => {
  if (Array.isArray(v)) return v.length === 1 ? canon(v[0]) : `[${v.map(canon).sort().join()}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join()}}`;
  return JSON.stringify(v) ?? "null";
};
// The site an http(s) IRI belongs to. Other schemes (urn:, _:) never count as dangling.
const origin = (iri: string): string | undefined => {
  try {
    const url = new URL(iri);
    return /^https?:$/.test(url.protocol) ? url.origin : undefined;
  } catch {
    return undefined;
  }
};
// Edit distance, for the "did you mean" of a dangling ref.
const distance = (a: string, b: string): number => {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[b.length]!;
};
// Keys other than these make an object with a @graph a node of its own (a named graph).
const own = (v: Obj): boolean => Object.keys(v).some((k) => k !== "@context" && k !== "@graph" && k !== "@id" && v[k] !== undefined);

/** The text of every active JSON-LD block under `root`. Inactive (hidden-route) blocks have another type. */
export const blocksOf = (root: Root): string[] =>
  Array.from(root.querySelectorAll('script[type="application/ld+json" i]'), (s) => s.textContent ?? "");

/**
 * Runs `rules` over the blocks of one page. A block is JSON text, or an already parsed JSON value.
 * All blocks are read as one graph: definitions that share an `@id` are compared with each other.
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
    const keys = Object.keys(node).filter((k) => k !== "@graph"); // top() reads a named graph's nodes
    const name = typeof id === "string" ? id : at;
    if (typeof id === "string") {
      if (!id.startsWith("_:") && !/^[a-z][a-z\d+.-]*:/i.test(id)) add("relative-id", at === id ? id : `${id} (from ${at})`, id);
      if (keys.length === 1) refs.push({ id, from: at });
      else {
        // No prototype, so keys such as "constructor" start out undefined like any other.
        const merged = defined.get(id) ?? defined.set(id, Object.create(null) as Obj).get(id)!;
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
        if (v["@graph"] !== undefined) {
          top(v["@graph"], has);
          if (!own(v)) return;
        }
        const label = typeof v["@id"] === "string" ? v["@id"] : `${types(v).join(",") || "node"}${where}`;
        if (!has) add("missing-context", `${label} has no @context`, v["@id"] as string | undefined);
        if (v["@id"] === undefined && !types(v).length) add("missing-type", `a node${where} has neither @id nor @type`);
        walk(v, label, "");
      }
    };
    top(value, false);
  });

  for (const [id, node] of defined) if (!types(node).length) add("missing-type", `${id} has no @type`, id);

  // The defined @id a dangling ref most likely meant: the same page with a longer or shorter
  // fragment (#org for #organization), or a typo of at most two characters.
  const near = (id: string): string | undefined => {
    const [base, frag] = id.split("#");
    let best: string | undefined;
    let score = 3;
    for (const d of defined.keys()) {
      const [dBase, dFrag] = d.split("#");
      const s = base === dBase && frag && dFrag && (dFrag.startsWith(frag) || frag.startsWith(dFrag)) ? 0 : distance(id, d);
      if (s < score) [best, score] = [d, s];
    }
    return best;
  };
  const sites = new Set([...defined.keys()].map(origin));
  for (const { id, from } of refs) {
    if (defined.has(id) || origin(id) === undefined || !sites.has(origin(id))) continue;
    const guess = near(id);
    add("dangling-ref", `${id} (from ${from})${guess ? `; did you mean ${guess}?` : ""}`, id);
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

/** What to do about an issue. Dev warnings add it; check() returns just the facts. */
const HINTS: Partial<Record<Rule, string>> = {
  "relative-id": "use an absolute @id such as https://your.site/page#name: a relative one is a different node on every URL",
  "dangling-ref": "no active block on this page defines that @id",
  conflict: "give the property one value: across blocks the page's graph holds both",
  "missing-type": "add a @type where the node is defined",
};

const seen = new Map<string, number>();

/**
 * Prints each issue unless it was already seen in the last 2 s, so the several renders of one page
 * warn once, and an issue that is fixed and comes back warns again.
 */
export function report(issues: readonly Issue[]): void {
  const now = performance.now(); // not Date.now(), which Next flags while prerendering
  if (seen.size > 500) seen.clear();
  for (const { rule, message } of issues) {
    const line = `[ldgraph] ${rule}: ${message}`;
    if (!(now - (seen.get(line) ?? -Infinity) < 2000)) console.warn(HINTS[rule] ? `${line} (${HINTS[rule]})` : line);
    seen.set(line, now);
  }
}
