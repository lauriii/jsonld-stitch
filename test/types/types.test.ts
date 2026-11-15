// Type tests: compiled (never run) against schema-dts 1.x and 2.x with skipLibCheck off.
// Every @ts-expect-error must be needed, or tsc fails.
import type { Article, BreadcrumbList, Graph, Organization, Product, WebSite } from "schema-dts";
import { JsonLd, ref, serialize, type Nodes, type Ref } from "ldgraph";
import { check, type Issue, type Rule } from "ldgraph/check";

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
const graph: Nodes = [
  organization,
  website,
  article,
  product,
  crumbs,
  cond && article,
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

// A value annotated with a schema-dts type is rejected: those unions include `string`. Use `satisfies`.
const annotated: Article = article;
// @ts-expect-error annotated, not satisfies
serialize(annotated);

// @ts-expect-error a node needs a @type or an @id
serialize({ name: "x" });

// @ts-expect-error ref() needs a node with an @id
ref(product);

declare const doc: Graph;
// @ts-expect-error schema-dts's Graph["@graph"] is Thing[], which includes string
serialize(doc["@graph"]);

// @ts-expect-error a property typo is caught by satisfies
export const typo = { "@type": "Organization", nmae: "x" } satisfies Organization;

// check() takes HTML or anything with querySelectorAll, e.g. a Document.
declare const document: Document;
export const issues: Issue[] = [...check("<html></html>"), ...check(document)];
export const rule: Rule = "dangling-ref";
// @ts-expect-error not a rule
export const notRule: Rule = "nope";
