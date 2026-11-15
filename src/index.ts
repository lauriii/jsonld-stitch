import { createElement, type ReactElement } from "react";
import { lint, report, SERVER } from "./lint.js";
import { Script } from "./script.js";
import { flatten, stringify } from "./serialize.js";
import type { Nodes, Ref } from "./types.js";

export { serialize } from "./serialize.js";
export type { Node, Nodes, Ref } from "./types.js";

/**
 * Renders one `<script type="application/ld+json">` holding `graph`, merged by `@id` and safely
 * escaped. Use it in any layout or page: blocks from different segments link to each other by
 * absolute `@id`, and together they form one graph (JSON-LD 1.1 §7). An empty graph renders nothing.
 */
export function JsonLd({ graph }: { graph: Nodes }): ReactElement | null {
  const nodes = flatten(graph);
  if (nodes.length === 0) return null;
  const json = stringify(nodes);
  // Dev only: rules that need just this block. Whole-page rules run in the browser.
  if (process.env.NODE_ENV !== "production") report(lint([JSON.parse(JSON.stringify(nodes))], SERVER));
  return createElement(Script, { json });
}

/**
 * A reference to `node` by its `@id`: `{ "@id": node["@id"] }`. Taking the node, not a string,
 * ties every reference to an imported definition, so a typo is a compile error.
 */
export function ref<const Id extends string>(node: { readonly "@id": Id }): Ref<Id> {
  if (process.env.NODE_ENV !== "production" && typeof node?.["@id"] !== "string") {
    console.warn("[ldgraph] ref() needs a node with an @id");
  }
  return { "@id": node["@id"] };
}
