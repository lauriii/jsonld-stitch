# jsonld-stitch

Safe JSON-LD for Next.js and React Server Components: each layout and page adds its own nodes, and
together they form one linked graph. Zero dependencies.

```sh
npm i jsonld-stitch
npm i -D schema-dts   # optional, recommended: types for the schema.org vocabulary
```

Next.js's Metadata API has no field for structured data. Its docs tell you to hand-write a
`<script type="application/ld+json">` with `JSON.stringify(data).replace(/</g, "\\u003c")`. That is
safe, but it leaves three things to you:

- **Escaping, on every block.** The `.replace` is easy to forget or to get subtly wrong (replacing only
  `</script>` misses `</script >`), and then a CMS headline can end the script element early. jsonld-stitch
  always escapes, and escapes the same characters Next.js does for its own inline data.
- **Typing.** Nothing checks that `nmae` should have been `name`. jsonld-stitch is built to work with
  [schema-dts](https://github.com/google/schema-dts), which types the vocabulary.
- **Composition.** The root layout knows the Organization and WebSite, a section layout knows the Blog,
  and the page knows the Article. A layout can't see its children's data, so nobody can write "the" graph.

jsonld-stitch is one component, one helper and one serializer, plus a `check()` for your tests.

## 60-second usage

**1. Put the site-wide nodes in a plain module** that layouts and pages both import:

```ts
// lib/graph.ts
import type { Organization, WebSite } from "schema-dts";
import { ref } from "jsonld-stitch";

export const SITE = "https://example.com"; // absolute: "#org" on /a and on /b are different nodes

export const organization = {
  "@type": "Organization",
  "@id": `${SITE}/#organization`,
  name: "Example",
  url: SITE,
  logo: `${SITE}/logo.png`,
} satisfies Organization;

export const website = {
  "@type": "WebSite",
  "@id": `${SITE}/#website`,
  url: SITE,
  name: "Example",
  publisher: ref(organization),
} satisfies WebSite;
```

**2. Render them once, in the root layout:**

```tsx
// app/layout.tsx
import { JsonLd } from "jsonld-stitch";
import { organization, website } from "@/lib/graph";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <head>
        <JsonLd graph={[organization, website]} />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

**3. Let each page describe what it owns, and link to the site nodes by `@id`:**

```tsx
// app/blog/[slug]/page.tsx
import type { BlogPosting, BreadcrumbList } from "schema-dts";
import { JsonLd, ref } from "jsonld-stitch";
import { SITE, organization, website } from "@/lib/graph";
import { getPost } from "@/lib/posts";

export default async function Post({ params }: PageProps<"/blog/[slug]">) {
  const { slug } = await params;
  const post = await getPost(slug);
  const url = `${SITE}/blog/${slug}`;

  return (
    <article>
      <JsonLd
        graph={[
          {
            "@type": "BlogPosting",
            "@id": `${url}#article`,
            url,
            headline: post.title, // what a rich result needs lives on the page's own node
            datePublished: post.publishedAt,
            author: { "@type": "Person", name: post.author },
            publisher: ref(organization), // site relationships are refs
            isPartOf: ref(website),
          } satisfies BlogPosting,
          {
            "@type": "BreadcrumbList",
            "@id": `${url}#breadcrumb`,
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: SITE },
              { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE}/blog` },
              { "@type": "ListItem", position: 3, name: post.title },
            ],
          } satisfies BreadcrumbList,
        ]}
      />
      <h1>{post.title}</h1>
    </article>
  );
}
```

```tsx
// app/blog/[slug]/loading.tsx: with Cache Components (the create-next-app default), a page that
// awaits params needs this or generateStaticParams, like any dynamic route, or `next build` fails.
export default function Loading() {
  return <p>Loading…</p>;
}
```

Nested layouts do the same: `app/blog/layout.tsx` renders `<JsonLd graph={blog} />` with
`isPartOf: ref(website)`. A complete app is in [`examples/app-router`](examples/app-router).

## How composition works

Every layout and page renders its **own** block. The blocks link to each other by absolute `@id`, and
JSON-LD 1.1 (§7.3, "Embedding JSON-LD in HTML documents") describes the `application/ld+json` blocks
on a page as **one** dataset. Read that way, the root's Organization, the section's Blog and the
page's BlogPosting form one graph, even though React rendered them in three places.

What has been checked, and what hasn't ([details](docs/verification.md)):

- **The JSON-LD reference processor** (jsonld.js, in `npm test`): merging the blocks gives exactly
  the triples of the same nodes in one block. The literal API algorithm (`extractAllScripts`) keeps
  each block in its own named graph, so a consumer that reads only the default graph sees none.
- **Google's Schema Markup Validator** joins a Product split across two blocks: a second block adding
  `offers` and `aggregateRating` to the same `@id`, an Offer pointing back with `itemOffered`, and an
  `offers` ref to an Offer in the other block all gave one Product with 0 errors, like the one-block
  control. Article, breadcrumb and Event splits have not been run.
- **Google's Rich Results Test**, which decides rich result eligibility, has **not** been run on
  split blocks yet.

```
<head>  {"@graph":[Organization #organization, WebSite #website]}          ← root layout
<body>  {"@graph":[Blog #blog → isPartOf #website]}                          ← blog layout
        {"@graph":[BlogPosting #article → publisher #organization, …]}       ← page
```

A package can't correctly merge everything into one `<script>`: layouts can't see their children and
don't re-render on client navigation ([why](docs/design.md#why-linked-blocks-not-one-script)). If you
want one block per page, render nothing in the root layout and pass the whole graph from the page:
`graph={[organization, website, blog, article]}`. Nodes that share an `@id` are merged, so including a
node twice is harmless.

### Rules of thumb

- **Use absolute `@id`s** with a hash: `https://example.com/blog/x#article`. A relative `#article`
  resolves against whatever URL the page was fetched from.
- **Keep the properties a rich result needs on the page's own node.** Use refs for site relationships
  (`publisher`, `isPartOf`, `brand`). Google's Schema Markup Validator joins a split Product, but the
  Rich Results Test hasn't been checked on split blocks (see [Google notes](#google-notes)), so
  following this rule keeps the page eligible either way.
- **Render the block where the data is ready.** Inside `<Suspense>` is fine: the block streams in with
  its content.
- **`<head>` or `<body>`** are both fine. A root layout can render into `<head>`.
- **Keep blocks lean.** Like anything a Server Component renders, the JSON appears twice in the HTML:
  once in the block and once in the RSC payload.
- **No CSP nonce needed.** A data block never runs, so `script-src` doesn't apply to it.

## API

```ts
import { JsonLd, ref, serialize, type Nodes, type Ref } from "jsonld-stitch";
import { check, type Issue, type Rule } from "jsonld-stitch/check";
```

### `<JsonLd graph={nodes} />`

Renders one `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[…]}</script>`.
An empty graph renders nothing. `graph` takes:

- a node, or an array of nodes, nested as deep as you like;
- a falsy value (`null`, `undefined`, `false`, `""`, `0`), which is skipped, so `cond && node` works;
- a whole JSON-LD document `{ "@context", "@graph" }`, for example from a CMS.

It works in Server Components (it serializes on the server and sends only the string to a ~0.5 kB
client component), in Client Components, and in the Pages Router. In the browser a block is
`application/ld+json` only while React shows it: content that React keeps hidden (a previous route
under Cache Components, an `<Activity mode="hidden">`, a Suspense boundary showing its fallback again)
gets an inactive type. See [hidden content](docs/design.md#hidden-content).

### `ref(node)`

Returns `{ "@id": node["@id"] }`. It takes the node rather than a string, so every reference points at an
imported definition: a typo is a compile error and "go to definition" works. A node without `@id` is a
type error. If the node's `@id` has a literal type (`` `${SITE}/#org` as const ``), the `Ref` keeps it.

### `serialize(graph)`

The string `JsonLd` renders, for anything outside React: route handlers, feeds, other renderers, tests.
It's pure and never logs. In order, it:

1. flattens arrays and `@graph` documents and drops falsy values (an object with a `@graph` and
   properties of its own is kept as a node too);
2. removes a node's `@context` when it is just schema.org (`http`/`https`, with or without `/`), and keeps
   any other;
3. merges nodes that share an `@id` and a `@context`: properties are combined, the first value wins on
   a conflict, and the merged node sits where the first one was;
4. wraps the result as `{"@context":"https://schema.org","@graph":[…]}`;
5. runs `JSON.stringify` and escapes `<`, `>`, `&`, U+2028 and U+2029 ([security](docs/security.md)).

Values follow `JSON.stringify`: `null` is kept; `undefined`, functions and symbols are dropped; `Date`
and `URL` become strings; `NaN` and `Infinity` become `null`; a `Set` or `Map` becomes `{}`; and a
`BigInt` or a cycle throws, failing the render like a hand-written `JSON.stringify` would.

### `check(htmlOrDom)` from `jsonld-stitch/check`

Reads every active JSON-LD block on a page as one graph and returns a list of `Issue`s
(`{ rule, message, id? }`), or `[]` for a clean page. Pass the HTML as a string (it is read the way a
browser reads it: comments, `<template>` content and the text of other scripts don't count), or a
`document`/element. See [Dev warnings](#dev-warnings) for the rules.

### Types

`Nodes` is deliberately minimal: an object with a `@type` (or an `@id` that adds to a node defined
elsewhere), a document, a falsy value, or an array of these. The vocabulary comes from
[schema-dts](https://github.com/google/schema-dts), which jsonld-stitch never imports. Both ways of using it work,
with schema-dts 1.x and 2.x:

```ts
// satisfies: checks the literal and keeps its exact shape, so ref() gets a typed @id.
const org = { "@type": "Organization", "@id": `${SITE}/#organization`, nmae: "Example" } satisfies Organization;
//                                                                     ~~~~ 'nmae' does not exist in type 'OrganizationLeaf'

// An annotation, as the Next.js docs write it: fine for <JsonLd graph={jsonLd} />.
const jsonLd: WithContext<Product> = { "@context": "https://schema.org", "@type": "Product", name: "Widget" };
```

Prefer `satisfies` for nodes you `ref()`: an annotated value's `@id` is optional in schema-dts, so
`ref()` rejects it.

## Testing your site

`check()` runs every rule over a whole page. Use it in any test runner:

```ts
import { check } from "jsonld-stitch/check";

test("structured data is linked and valid", async () => {
  const html = await (await fetch("http://localhost:3000/blog/hello")).text();
  expect(check(html)).toEqual([]);
});
```

In Playwright, `check(await page.content())` checks the live DOM after navigation.

## Dev warnings

In development, jsonld-stitch checks each block in the terminal (the rules that need one block) and the whole
page in the browser console (the rules that need every block). For example, in the browser:
`[jsonld-stitch] dangling-ref: https://example.com/#org (from https://example.com/blog/x#article.publisher); did you mean https://example.com/#organization?`.
Each rule runs in one place only, and an issue is printed again only after it has been gone for a
moment. Production builds contain none of this code.

| Rule | What it means | Where |
| --- | --- | --- |
| `relative-id` | An `@id` without a scheme (`#org`, `/about`). `_:` blank nodes are fine. | terminal |
| `conflict` | Two definitions of one `@id` give a property different values. In one block jsonld-stitch keeps the first; across blocks the page's graph holds both. | terminal (one block), browser (across blocks) |
| `product` | A Product needs `name` and one of `offers`, `review` or `aggregateRating` (Google's product snippet minimum). | terminal |
| `breadcrumb` | Every ListItem needs `position` and `name`; every one but the last needs `item`. | terminal |
| `dangling-ref` | A `{ "@id" }` reference to a node that no block on the page defines, on a site that does define nodes here. Links to other sites (Wikidata, …) are fine. | browser |
| `missing-type` | A node with no `@type` after reading the whole page, or a node with neither `@id` nor `@type`. | browser |
| `missing-context` | A block with no `@context` (hand-written or third-party blocks; jsonld-stitch's always have one). | browser |
| `invalid-json` | A block that isn't valid JSON. | browser |

jsonld-stitch doesn't validate the vocabulary or try to be a Rich Results validator: that changes too often,
and [Google's Rich Results Test](https://search.google.com/test/rich-results) is the authority.

## Security

jsonld-stitch escapes `<`, `>`, `&`, U+2028 and U+2029 as `\u003c`-style escapes, the set Next.js uses for its
own inline data. They can only occur inside JSON strings, so the escaping is both safe (no `<` reaches
the HTML, so no end tag, comment or CDATA marker can form) and lossless (`JSON.parse` gives back your
data). Details, and what other approaches get wrong: [docs/security.md](docs/security.md).

## Pages Router, CMS JSON-LD, other React apps

- **Pages Router**: the same component works in `pages/*.tsx` on React 18.3 or 19. Each page is the
  whole tree, so pass the whole graph from the page (one block).
- **CMS or headless JSON-LD**: `graph={await res.json()}` accepts a whole `{ "@context", "@graph" }`
  document and merges it with your own nodes. A CMS `@context` other than schema.org is kept, on its
  nodes, and nodes under different contexts are never merged.
  [`examples/drupal-canvas`](examples/drupal-canvas) renders a Drupal Canvas site's head, JSON-LD
  included, from its content API, with a script that checks the served graph against the API's.
- **Other React apps**: `JsonLd` is plain React and should work in any RSC host (React Router, Waku) and
  in client-rendered apps, but only Next.js is tested. Outside React, use `serialize()`.

## Google notes

- Google's [Rich Results Test](https://search.google.com/test/rich-results) is the authority. Paste a
  page's HTML into its Code tab to test without deploying.
- Google documents linking items with `@id`, but none of its examples spans two script blocks. What
  has been tested so far ([evidence](docs/verification.md), 2026-11-15):
  - **Proven:** Google's [Schema Markup Validator](https://validator.schema.org/) joins a Product
    split across two blocks, in all three ways tested (same `@id` in both blocks, `itemOffered` back
    to the Product, `offers` ref to the Offer), with 0 errors and the same result as one block.
  - **Not yet tested:** the Rich Results Test on any split page (it needs a signed-in browser), and
    the validator on split Article, BreadcrumbList and Event pages.

  So until the Rich Results Test confirms it, keep the properties a rich result needs on the page's
  own node (see [Rules of thumb](#rules-of-thumb)), or use one block per page for pages that need
  rich results. The pages to paste in are in [docs/verification/pages](docs/verification/pages).
- FAQ and HowTo markup no longer produces rich results for most sites, so jsonld-stitch has no special support
  for them.

## Migrating from a hand-written `<script>`

```tsx
// Before
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
/>

// After: the same value, annotated (WithContext<Product>) or not
<JsonLd graph={jsonLd} />
```

Then give your nodes absolute `@id`s, move the site-wide ones into a shared module, and replace copies
of them with `ref()`.

## Support

| | Supported |
| --- | --- |
| React | `^18.3 \|\| ^19` (App Router needs 19) |
| Next.js | Tested on 15.5 and 16.x: App Router with Cache Components on and off, and Pages Router |
| Node.js | `>=20.9` |
| TypeScript | `>=5.0` (`satisfies` needs 4.9+ in your code) |
| Module format | ESM only (Node 20.19+ and 22.12+ can also `require()` it) |

## License

MIT
