// Renders each test page with ldgraph's real <JsonLd> component (react-dom/server, production mode),
// so every <script> block is the exact bytes ldgraph emits.
// Run from the repo root: npm run build && NODE_ENV=production node docs/verification/gen-pages.mjs
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const LIB = new URL("../../", import.meta.url).pathname; // the repo root; run `npm run build` first
const require = createRequire(LIB + "/package.json");
const { createElement: h } = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { JsonLd, ref, serialize } = await import(LIB + "/dist/index.js");
const OUT = new URL("./pages/", import.meta.url).pathname;

const SITE = "https://ldgraph-proof.example.com";
const block = (graph) => renderToStaticMarkup(h(JsonLd, { graph }));
const page = (title, headBlocks, bodyBlocks, body) =>
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${headBlocks.map(block).join("\n")}
</head>
<body>
<main>
${body}
${bodyBlocks.map(block).join("\n")}
</main>
</body>
</html>
`;

// Shared site nodes (what a root layout would own).
const organization = {
  "@type": "Organization", "@id": `${SITE}/#organization`, name: "Proof Widgets Ltd",
  url: SITE, logo: `${SITE}/logo.png`,
};
const website = { "@type": "WebSite", "@id": `${SITE}/#website`, url: SITE, name: "Proof Widgets", publisher: ref(organization) };
const person = { "@type": "Person", "@id": `${SITE}/#jane`, name: "Jane Example", url: `${SITE}/people/jane` };

// ---- A. Product ----
const pUrl = `${SITE}/products/widget`;
const productCore = {
  "@type": "Product", "@id": `${pUrl}#product`, name: "Proof Widget",
  image: [`${SITE}/img/widget-1x1.jpg`, `${SITE}/img/widget-4x3.jpg`], description: "A widget used to test JSON-LD.",
  sku: "PW-1", brand: { "@type": "Brand", name: "Proof" },
};
const offer = {
  "@type": "Offer", "@id": `${pUrl}#offer`, url: pUrl, price: "19.99", priceCurrency: "EUR",
  availability: "https://schema.org/InStock", itemCondition: "https://schema.org/NewCondition",
};
const rating = { "@type": "AggregateRating", ratingValue: "4.4", reviewCount: "89" };
const productAddOn = { "@id": `${pUrl}#product`, offers: { ...offer }, aggregateRating: rating };

const pages = {
  // A1: same @id, properties added by a second block.
  "A1-product-sameid-split": page("A1", [[productCore]], [[productAddOn]], "<h1>Proof Widget</h1>"),
  // A2: Offer node in block 2 points back with itemOffered: ref(product).
  "A2-product-offer-itemOffered-split": page("A2", [[productCore]],
    [[{ ...offer, itemOffered: ref(productCore) }]], "<h1>Proof Widget</h1>"),
  // A3: Product (block 1) points forward with offers: ref(offer); Offer defined in block 2.
  "A3-product-offers-ref-split": page("A3", [[{ ...productCore, offers: ref(offer), aggregateRating: rating }]],
    [[offer]], "<h1>Proof Widget</h1>"),
  "A0-product-control": page("A0", [], [[productCore, productAddOn]], "<h1>Proof Widget</h1>"),
};

// ---- B. Article ----
const aUrl = `${SITE}/blog/hello`;
const article = {
  "@type": "Article", "@id": `${aUrl}#article`, url: aUrl, headline: "Hello, linked graph",
  image: [`${SITE}/img/hello-16x9.jpg`], datePublished: "2026-11-01T08:00:00+00:00",
  dateModified: "2026-11-02T08:00:00+00:00", author: ref(person), publisher: ref(organization), isPartOf: ref(website),
};
pages["B1-article-split"] = page("B1", [[organization, website, person]], [[article]], "<h1>Hello, linked graph</h1>");
pages["B0-article-control"] = page("B0", [], [[organization, website, person, article]], "<h1>Hello, linked graph</h1>");

// ---- C. BreadcrumbList ----
const cUrl = `${SITE}/guides/widgets`;
const homePage = { "@type": "WebPage", "@id": `${SITE}/`, url: `${SITE}/`, name: "Home", isPartOf: ref(website) };
const guidesPage = { "@type": "CollectionPage", "@id": `${SITE}/guides`, url: `${SITE}/guides`, name: "Guides", isPartOf: ref(website) };
const thisPage = { "@type": "WebPage", "@id": cUrl, url: cUrl, name: "Widget guide", isPartOf: ref(website) };
// Names only on the referenced WebPage nodes: the ListItems carry no name.
const crumbsNoName = {
  "@type": "BreadcrumbList", "@id": `${cUrl}#breadcrumb`,
  itemListElement: [
    { "@type": "ListItem", position: 1, item: ref(homePage) },
    { "@type": "ListItem", position: 2, item: ref(guidesPage) },
    { "@type": "ListItem", position: 3, item: ref(thisPage) },
  ],
};
const crumbsNamed = {
  ...crumbsNoName,
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: ref(homePage) },
    { "@type": "ListItem", position: 2, name: "Guides", item: ref(guidesPage) },
    { "@type": "ListItem", position: 3, name: "Widget guide", item: ref(thisPage) },
  ],
};
pages["C1-breadcrumb-noname-split"] = page("C1", [[organization, website, homePage, guidesPage, thisPage]], [[crumbsNoName]], "<h1>Widget guide</h1>");
pages["C2-breadcrumb-named-split"] = page("C2", [[organization, website, homePage, guidesPage, thisPage]], [[crumbsNamed]], "<h1>Widget guide</h1>");
pages["C0-breadcrumb-noname-control"] = page("C0", [], [[organization, website, homePage, guidesPage, thisPage, crumbsNoName]], "<h1>Widget guide</h1>");

// ---- D. Event ----
const eUrl = `${SITE}/events/launch`;
const place = {
  "@type": "Place", "@id": `${SITE}/#venue`, name: "Proof Hall",
  address: { "@type": "PostalAddress", streetAddress: "1 Example Street", addressLocality: "Helsinki", postalCode: "00100", addressCountry: "FI" },
};
const event = {
  "@type": "Event", "@id": `${eUrl}#event`, name: "Proof Widget Launch", url: eUrl,
  startDate: "2027-03-01T18:00:00+02:00", endDate: "2027-03-01T21:00:00+02:00",
  eventStatus: "https://schema.org/EventScheduled", eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
  location: ref(place), image: [`${SITE}/img/launch.jpg`], description: "Launch event.",
  organizer: ref(organization), performer: { "@type": "PerformingGroup", name: "The Examples" },
  offers: { "@type": "Offer", url: eUrl, price: "0", priceCurrency: "EUR", availability: "https://schema.org/InStock", validFrom: "2026-11-01T00:00:00+02:00" },
};
pages["D1-event-split"] = page("D1", [[organization, place]], [[event]], "<h1>Proof Widget Launch</h1>");
pages["D0-event-control"] = page("D0", [], [[organization, place, event]], "<h1>Proof Widget Launch</h1>");

for (const [name, html] of Object.entries(pages)) writeFileSync(OUT + name + ".html", html);
// Sanity: serialize() bytes equal the block contents.
console.log("serialize matches:", pages["D0-event-control"].includes(serialize([organization, place, event])));
console.log(Object.keys(pages).join("\n"));
