// Type tests: compiled (never run) against schema-dts 1.x and 2.x with skipLibCheck off.
// Every @ts-expect-error must be needed, or tsc fails.
import type { Article, BreadcrumbList, Graph, Organization, Product, Thing, WebSite, WithContext } from "schema-dts";
import { JsonLd, ref, serialize, type JsonLdDocument, type Nodes, type Ref } from "jsonld-stitch";
import { check, type Issue, type Rule } from "jsonld-stitch/check";

const SITE = "https://example.com";

export const organization = {
  "@type": "Organization",
  "@id": `${SITE}/#organization`,
  name: "Example",
  url: SITE,
} satisfies Organization;

export const website = {
  "@type": "WebSite",
  "@id": `${SITE}/#website`,
  url: SITE,
  publisher: ref(organization),
} satisfies WebSite;

const article = {
  "@type": "Article",
  "@id": `${SITE}/a#article`,
  headline: "x",
  datePublished: new Date().toISOString(),
  publisher: ref(organization),
  isPartOf: ref(website),
  author: [{ "@type": "Person", name: "A" }],
} satisfies Article;

const product = {
  "@type": "Product",
  name: "P",
  offers: { "@type": "Offer", price: 1, priceCurrency: "EUR" },
} satisfies Product;

const crumbs = {
  "@type": "BreadcrumbList",
  itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: SITE }],
} satisfies BreadcrumbList;

// Everything a graph may hold: nodes, falsy values, nested arrays, partial nodes and whole documents.
const cond = Math.random() > 0.5;
declare const slug: string;
declare const count: number;
const graph: Nodes = [
  organization,
  website,
  article,
  product,
  crumbs,
  cond && article,
  slug && article,
  count && article,
  [article, [null, undefined]],
  { "@id": organization["@id"], logo: `${SITE}/logo.png` },
  { "@context": "https://schema.org", "@graph": [organization] },
];
export const json: string = serialize(graph);
export const element = JsonLd({ graph });

// ref() keeps a literal id when the node has one (`as const`); a satisfies-checked node widens it to string.
const pinned = { "@type": "Organization", "@id": `${SITE}/#organization` as const } satisfies Organization;
export const literal: Ref<"https://example.com/#organization"> = ref(pinned);
// @ts-expect-error a different literal id is not assignable
export const wrong: Ref<"https://example.com/#website"> = ref(pinned);
export const widened: Ref<string> = ref(organization);

// Values annotated with schema-dts types work too, as the Next.js and schema-dts docs write them.
const annotated: Article = article;
const withContext: WithContext<Product> = { "@context": "https://schema.org", "@type": "Product", name: "P" };
declare const thing: Thing;
export const annotatedJson: string = serialize([annotated, withContext]);
export const annotatedElement = JsonLd({ graph: withContext });
// ...except a bare Thing, which may be a plain string (an IRI), not a node.
// @ts-expect-error Thing includes string
serialize(thing);
// ...and ref(), which needs a known @id: schema-dts makes it optional.
// @ts-expect-error @id may be undefined on an annotated value
ref(annotated);

// @ts-expect-error a @context must be an IRI, an object, null or an array of these
serialize({ "@context": 42, "@type": "Thing" });

// @ts-expect-error a node needs a @type or an @id
serialize({ name: "x" });

// @ts-expect-error ref() needs a node with an @id
ref(product);

declare const doc: Graph;
// @ts-expect-error schema-dts's Graph["@graph"] is Thing[], which includes string
serialize(doc["@graph"]);

// @ts-expect-error a property typo is caught by satisfies
export const typo = { "@type": "Organization", nmae: "x" } satisfies Organization;

// A CMS's JSON-LD, typed as its SDK types parsed JSON, is passed as is: no cast. This is the type
// the Drupal Canvas SDK gives head.script[].textContent, declared here rather than imported.
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type SdkJsonLd = JsonValue[] | { [key: string]: JsonValue };
declare const textContent: SdkJsonLd;
declare const sdkObject: { [key: string]: JsonValue };
declare const sdkArray: JsonValue[];
declare const record: Record<string, unknown>;
declare const parsed: any;
export const sdkElement = JsonLd({ graph: textContent });
export const sdkJson: string = serialize(textContent);
export const sdkParts: string = serialize([sdkObject, sdkArray, record, parsed]);
// ...mixed with authored nodes, in any order and nesting...
export const mixed: Nodes = [organization, textContent, [website, sdkObject], cond && textContent];
export const asDocument: JsonLdDocument = textContent;
// ...in every shape a CMS returns: @context + @graph, one node, an @id-only node, an array.
const docs: SdkJsonLd[] = [
  { "@context": "https://schema.org", "@graph": [{ "@type": "Organization", "@id": `${SITE}/#organization` }] },
  { "@context": "https://schema.org", "@type": "Article", headline: "x" },
  { "@id": `${SITE}/#organization`, logo: `${SITE}/logo.png` },
  [{ "@context": "https://schema.org", "@type": "WebSite", url: SITE }],
];
export const docsJson: string = serialize(docs);

// This loosens nothing for authored nodes: an object literal or a variable with named properties is
// never a JsonLdDocument, so it is still checked as a node.
const untypedNode = { name: "x" };
// @ts-expect-error a node needs a @type or an @id, in a variable too
serialize(untypedNode);
// @ts-expect-error ...and inside an array
serialize([organization, { name: "x" }]);
// @ts-expect-error ...and inside a document's @graph
serialize({ "@context": "https://schema.org", "@graph": [{ name: "x" }] });
// @ts-expect-error a string is not a node, even next to one
serialize([organization, "https://example.com/"]);
// @ts-expect-error a JSON-LD document is an object or an array, never a string
serialize("{}");
// @ts-expect-error ...or a number
JsonLd({ graph: 42 });
declare const unknownValue: unknown;
// @ts-expect-error unknown must be typed as JSON (or narrowed) first
serialize(unknownValue);

// check() takes HTML or anything with querySelectorAll, e.g. a Document.
declare const document: Document;
export const issues: Issue[] = [...check("<html></html>"), ...check(document)];
export const rule: Rule = "dangling-ref";
// @ts-expect-error not a rule
export const notRule: Rule = "nope";
