/**
 * A JSON-LD node object: it has a `@type`, or an `@id` that adds properties to
 * a node defined elsewhere (`{ "@id": org["@id"], logo }`). ldgraph does not
 * type the vocabulary: check values with `satisfies` and your own schema-dts,
 * e.g. `const org = { "@type": "Organization", ... } satisfies Organization`.
 */
export type Node =
  | { readonly "@type": string | readonly string[]; readonly "@id"?: string; readonly [key: string]: unknown }
  | { readonly "@type"?: string | readonly string[]; readonly "@id": string; readonly [key: string]: unknown };

/** A reference to a node by its `@id`. Create one with `ref(node)`. */
export type Ref<Id extends string = string> = { readonly "@id": Id };

/**
 * What `<JsonLd graph>` and `serialize()` accept: a node, a whole JSON-LD
 * document (`{ "@context", "@graph" }`, e.g. from a CMS), a falsy value (so
 * `cond && node` works) or an array of any of these, nested freely.
 */
export type Nodes =
  | Node
  | { readonly "@context"?: unknown; readonly "@graph": Nodes }
  | null
  | undefined
  | false
  | readonly Nodes[];

/** The rules `check()` runs. See the README for what each one means. */
export type Rule =
  | "invalid-json"
  | "missing-context"
  | "missing-type"
  | "relative-id"
  | "dangling-ref"
  | "conflict"
  | "product"
  | "breadcrumb";

/** One problem found by `check()`. `id` is the `@id` involved, when there is one. */
export type Issue = { rule: Rule; message: string; id?: string };
