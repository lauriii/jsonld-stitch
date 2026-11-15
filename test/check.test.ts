import { describe, expect, it } from "vitest";
import { check, type Issue } from "../src/check.ts";
import { serialize, type Nodes } from "../src/index.ts";

const SITE = "https://example.com";
const org = { "@type": "Organization", "@id": `${SITE}/#organization`, name: "Example", url: SITE };
const website = { "@type": "WebSite", "@id": `${SITE}/#website`, url: SITE, publisher: { "@id": org["@id"] } };
const article = {
  "@type": "Article",
  "@id": `${SITE}/blog/x#article`,
  headline: "X",
  publisher: { "@id": org["@id"] },
  isPartOf: { "@id": website["@id"] },
  sameAs: { "@id": "https://www.wikidata.org/wiki/Q42" },
};

/** One block as ldgraph renders it. */
const ours = (graph: Nodes): string => `<script type="application/ld+json">${serialize(graph)}</script>`;
/** One hand-written block, exactly as given. */
const raw = (text: string, type = "application/ld+json"): string => `<script type="${type}">${text}</script>`;
const html = (...blocks: string[]): string => `<!doctype html><html><head>${blocks[0] ?? ""}</head><body>${blocks.slice(1).join("<p>x</p>")}</body></html>`;
const rules = (issues: Issue[]): string[] => issues.map((i) => i.rule);

describe("check", () => {
  it("returns [] for a clean multi-block page, where a ref in one block resolves to another", () => {
    expect(check(html(ours([org, website]), ours(article)))).toEqual([]);
  });

  it("returns [] for a page with no JSON-LD", () => {
    expect(check("<p>hello</p>")).toEqual([]);
  });

  it("finds blocks however the type attribute is written", () => {
    const bad = '{"@context":"https://schema.org","@type":"Thing","@id":"#x"}';
    for (const tag of [
      `<script type="application/ld+json">${bad}</script>`,
      `<script type='application/ld+json'>${bad}</script >`,
      `<script type=application/ld+json>${bad}</script>`,
      `<SCRIPT id="a" TYPE="Application/LD+JSON" data-x="1">${bad}</SCRIPT>`,
    ]) {
      expect(rules(check(tag))).toEqual(["relative-id"]);
    }
  });

  it("ignores inactive (hidden-route) blocks and other script types", () => {
    const dangling = serialize({ ...article, publisher: { "@id": `${SITE}/#nobody` } });
    expect(check(html(raw(dangling, "text/x-ldgraph-inactive"), raw("not json", "application/json"), ours(org)))).toEqual([]);
  });

  it("reads a DOM through querySelectorAll, active blocks only", () => {
    const blocks = [{ textContent: serialize(org) }, { textContent: "{" }];
    const selectors: string[] = [];
    const root = {
      querySelectorAll: (s: string) => {
        selectors.push(s);
        return blocks;
      },
    };
    expect(rules(check(root))).toEqual(["invalid-json"]);
    expect(selectors).toEqual(['script[type="application/ld+json" i]']);
  });

  it("invalid-json", () => {
    expect(check(html(ours(org), raw('{"@type": "Thing",}')))).toEqual([
      { rule: "invalid-json", message: expect.stringMatching(/^block 2: /) },
    ]);
  });

  it("missing-context: only for blocks without one", () => {
    const issues = check(html(ours(org), raw(JSON.stringify({ "@type": "Thing", "@id": `${SITE}/#t`, name: "t" }))));
    expect(issues).toEqual([{ rule: "missing-context", message: `${SITE}/#t has no @context`, id: `${SITE}/#t` }]);
    expect(check(raw(JSON.stringify([{ "@context": "https://schema.org", "@type": "Thing" }])))).toEqual([]);
    expect(check(raw(JSON.stringify({ "@context": "https://schema.org", "@graph": [{ "@type": "Thing" }] })))).toEqual([]);
  });

  it("missing-type: after merging the whole page", () => {
    // A partial node in one block and its full definition in another is fine.
    expect(check(html(ours(org), ours({ "@id": org["@id"], logo: "l" } as Nodes)))).toEqual([]);
    expect(check(ours({ "@id": `${SITE}/#untyped`, name: "u" } as Nodes))).toEqual([
      { rule: "missing-type", message: `${SITE}/#untyped has no @type`, id: `${SITE}/#untyped` },
    ]);
    expect(rules(check(raw(JSON.stringify({ "@context": "https://schema.org", name: "n" }))))).toEqual(["missing-type"]);
  });

  it("relative-id: anywhere, but blank nodes and other schemes are fine", () => {
    const issues = check(ours({ "@type": "Thing", "@id": "#thing", about: { "@id": "/about" }, a: { "@id": "_:b0" }, u: { "@id": "urn:isbn:1" } }));
    expect(issues).toEqual([
      { rule: "relative-id", message: "#thing", id: "#thing" },
      { rule: "relative-id", message: "/about (from #thing.about)", id: "/about" },
    ]);
  });

  it("dangling-ref: same-site refs must resolve; external IRIs may not", () => {
    const issues = check(html(ours(website), ours(article)));
    expect(issues).toEqual([
      { rule: "dangling-ref", message: `${org["@id"]} (from ${website["@id"]}.publisher)`, id: org["@id"] },
      { rule: "dangling-ref", message: `${org["@id"]} (from ${article["@id"]}.publisher)`, id: org["@id"] },
    ]);
    // The Wikidata ref in `article` never counts, and neither does a ref when nothing on the page is from its site.
    expect(check(ours({ "@type": "Thing", "@id": "https://other.example/#t", x: { "@id": `${SITE}/#nobody` } }))).toEqual([]);
  });

  it("conflict: the same @id with different values, across blocks", () => {
    const issues = check(html(ours(org), ours({ ...org, name: "Other", url: SITE })));
    expect(issues).toEqual([{ rule: "conflict", message: `${org["@id"]} name: "Example" vs "Other"`, id: org["@id"] }]);
    // Key order does not matter, and nested definitions count too.
    const person = (p: object) => ({ "@type": "Article", "@id": `${SITE}/${Math.random()}`, author: p });
    expect(check(html(ours(person({ "@type": "Person", "@id": `${SITE}/#me`, name: "Me" })), ours(person({ name: "Me", "@id": `${SITE}/#me`, "@type": "Person" }))))).toEqual([]);
    expect(rules(check(html(ours(person({ "@type": "Person", "@id": `${SITE}/#me`, name: "Me" })), ours(person({ "@type": "Person", "@id": `${SITE}/#me`, name: "You" })))))).toEqual(["conflict"]);
  });

  it("conflict: inside one hand-written block", () => {
    const text = JSON.stringify({ "@context": "https://schema.org", "@graph": [org, { ...org, name: "Other" }] });
    expect(rules(check(raw(text)))).toEqual(["conflict"]);
  });

  it("product: needs a name and offers, review or aggregateRating", () => {
    expect(check(ours({ "@type": "Product", "@id": `${SITE}/p#product`, image: "i" }))).toEqual([
      { rule: "product", message: `${SITE}/p#product needs a name`, id: `${SITE}/p#product` },
      { rule: "product", message: `${SITE}/p#product needs offers, review or aggregateRating`, id: `${SITE}/p#product` },
    ]);
    expect(check(ours({ "@type": ["Product", "Thing"], name: "P", aggregateRating: { "@type": "AggregateRating", ratingValue: 4, reviewCount: 2 } }))).toEqual([]);
    // Parts of a Product may come from different blocks.
    expect(check(html(ours({ "@type": "Product", "@id": `${SITE}/p`, name: "P" }), ours({ "@id": `${SITE}/p`, offers: { "@type": "Offer", price: 1 } } as Nodes)))).toEqual([]);
    // A Product that is only an Offer's itemOffered is not a product snippet.
    expect(check(ours({ "@type": "Offer", price: 1, itemOffered: { "@type": "Product", name: "P" } }))).toEqual([]);
    expect(rules(check(ours({ "@type": "ItemList", itemListElement: [{ "@type": "Product" }] })))).toEqual(["product", "product"]);
  });

  it("breadcrumb: position and name on every item, item on every item but the last", () => {
    const crumbs = (items: unknown[]) => ours({ "@type": "BreadcrumbList", "@id": `${SITE}/a#breadcrumb`, itemListElement: items });
    expect(check(crumbs([
      { "@type": "ListItem", position: 1, name: "Home", item: SITE },
      { "@type": "ListItem", position: 2, item: { "@type": "WebPage", "@id": `${SITE}/a`, name: "A" } },
      { "@type": "ListItem", position: 3, name: "Here" },
    ]))).toEqual([]);
    expect(check(crumbs([{ "@type": "ListItem", name: "Home" }, { "@type": "ListItem", position: 2 }]))).toEqual([
      { rule: "breadcrumb", message: `${SITE}/a#breadcrumb item 1 needs a position`, id: `${SITE}/a#breadcrumb` },
      { rule: "breadcrumb", message: `${SITE}/a#breadcrumb item 1 needs an item URL`, id: `${SITE}/a#breadcrumb` },
      { rule: "breadcrumb", message: `${SITE}/a#breadcrumb item 2 needs a name`, id: `${SITE}/a#breadcrumb` },
    ]);
    expect(rules(check(crumbs([])))).toEqual(["breadcrumb"]);
    // Nested under a WebPage, without an @id, it is still checked.
    expect(check(ours({ "@type": "WebPage", "@id": `${SITE}/a`, breadcrumb: { "@type": "BreadcrumbList", itemListElement: { "@type": "ListItem", name: "Home" } } }))).toEqual([
      { rule: "breadcrumb", message: `${SITE}/a.breadcrumb item 1 needs a position` },
    ]);
  });
});
