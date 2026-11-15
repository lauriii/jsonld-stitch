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

declare const untyped: unique symbol;

/**
 * A JSON object that is typed only by an index signature, the way an SDK or a fetch wrapper types
 * parsed JSON: `{ [key: string]: JsonValue }`, `Record<string, unknown>`. Its one optional property
 * is a symbol that no value ever has, so an object literal or a variable with named properties never
 * matches it (TypeScript's weak type check): authored nodes are still checked as `NodeObject`s.
 */
type JsonObject = { readonly [untyped]?: never };
type JsonValue = string | number | boolean | null | readonly JsonValue[] | JsonObject;

/**
 * A JSON-LD document as a CMS or its SDK returns it, typed as plain JSON: an object (`{ "@context",
 * "@graph" }`, a single node, a node with just an `@id`) or an array. A value typed
 * `JsonValue[] | { [key: string]: JsonValue }`, `Record<string, unknown>` or `any` is one. Only values
 * typed by an index signature match: an object literal is a node, and is checked as one.
 */
export type JsonLdDocument = JsonObject | readonly JsonValue[];

/**
 * What `<JsonLd graph>` and `serialize()` accept: a node, a whole JSON-LD document
 * (`{ "@context", "@graph" }`), a CMS's JSON-LD typed as plain JSON (`JsonLdDocument`), a falsy value
 * (so `cond && node` works whether `cond` is a boolean, a string or a number) or an array of any of
 * these, nested freely. Anything else found at runtime (a string, `true`) is skipped, with a dev warning.
 */
export type Nodes =
  | NodeObject
  | { readonly "@context"?: Context; readonly "@graph": Nodes }
  | JsonLdDocument
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
