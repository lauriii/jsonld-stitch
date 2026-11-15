type Types = string | readonly string[];
type ContextEntry = string | null | { readonly [key: string]: unknown };
type Context = ContextEntry | readonly ContextEntry[];
type Typed = { readonly "@type": Types; readonly "@id"?: string; readonly "@context"?: Context };
type Linked = { readonly "@type"?: Types; readonly "@id": string; readonly "@context"?: Context };
type Open = { readonly [key: string]: unknown };

/**
 * A JSON-LD node object: it has a `@type`, or an `@id` that adds properties to a node defined
 * elsewhere (`{ "@id": org["@id"], logo }`). jsonld-stitch does not type the vocabulary; schema-dts does.
 * `Typed` and `Linked` carry no index signature, so values annotated with an interface (schema-dts's
 * `Article`, `WithContext<Product>`) match them; the `Open` variants take any object literal.
 */
export type NodeObject = Typed | Linked | (Typed & Open) | (Linked & Open);

/** A reference to a node by its `@id`. Create one with `ref(node)`. */
export type Ref<Id extends string = string> = { readonly "@id": Id };

/**
 * What `<JsonLd graph>` and `serialize()` accept: a node, a whole JSON-LD document
 * (`{ "@context", "@graph" }`, e.g. from a CMS), a falsy value (so `cond && node` works whether
 * `cond` is a boolean, a string or a number) or an array of any of these, nested freely.
 */
export type Nodes =
  | NodeObject
  | { readonly "@context"?: Context; readonly "@graph": Nodes }
  | null
  | undefined
  | false
  | ""
  | 0
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
