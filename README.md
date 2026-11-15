# ldgraph

Safe, typed JSON-LD for React Server Components: one linked graph across layouts and pages, zero
dependencies.

```sh
npm i ldgraph
npm i -D schema-dts   # optional, recommended: types for the schema.org vocabulary
```

Next.js's Metadata API has no field for structured data. Its docs tell you to hand-write a
`<script type="application/ld+json">` with `JSON.stringify` and escape `<` yourself. That leaves three
problems:

- **Safety.** One missed character in a CMS headline (`</script >`, `<!--`) ends the script element
  early. Escaping only `<` is enough for HTML but not for every consumer, and entity-escaping changes
  the data.
- **Typing.** Nothing checks that `nmae` should have been `name`.
- **Composition.** The root layout knows the Organization and WebSite, a section layout knows the Blog,
  and the page knows the Article. A layout can't see its children's data, so nobody can write "the" graph.

ldgraph is one component, one helper and one serializer that solve those, plus a `check()` for your tests.

## 60-second usage

**1. Put the site-wide nodes in a plain module** that layouts and pages both import:

```ts
// lib/graph.ts
import type { Organization, WebSite } from "schema-dts";
import { ref } from "ldgraph";

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
import { JsonLd } from "ldgraph";
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
import { JsonLd, ref } from "ldgraph";
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

Nested layouts do the same: `app/blog/layout.tsx` renders `<JsonLd graph={blog} />` with
`isPartOf: ref(website)`. A complete app is in [`examples/app-router`](examples/app-router).

## How composition works

Every layout and page renders its **own** block. The blocks link to each other by absolute `@id`, and
JSON-LD 1.1 (§7, "Embedding JSON-LD in HTML documents") says a processor reads every
`application/ld+json` block on a page into **one** dataset. So the root's Organization, the section's
Blog and the page's BlogPosting form one graph, even though React rendered them in three places.

```
<head>  {"@graph":[Organization #organization, WebSite #website]}          ← root layout
<body>  {"@graph":[Blog #blog → isPartOf #website]}                          ← blog layout
        {"@graph":[BlogPosting #article → publisher #organization, …]}       ← page
```

**Why not merge everything into one `<script>`?** A package can't do that correctly. A layout can't see
its children, renders in parallel with them, and isn't re-rendered when you navigate between its
children. Any collector either emits too early (in a layout) or misses the layouts (in the page), and on
a client navigation the layouts' code doesn't run at all. That only shows up in production builds.
Linked blocks have none of these problems: each one is correct on its own.

**One block per page instead.** If you want it, render nothing in the root layout and pass the whole
graph from the page: `graph={[organization, website, blog, article]}`. Nodes that share an `@id` are
merged, so including a node twice is harmless.

### Rules of thumb

- **Use absolute `@id`s** with a hash: `https://example.com/blog/x#article`. A relative `#article`
  resolves against whatever URL the page was fetched from.
- **Keep the properties a rich result needs on the page's own node.** Use refs for site relationships
  (`publisher`, `isPartOf`, `brand`). Whether Google joins `@id`s *across* script blocks is not yet
  verified (see [Google notes](#google-notes)); following this rule keeps the page eligible either way.
- **Render the block where the data is ready.** Inside `<Suspense>` is fine too: the block streams in
  with its content.
- **`<head>` or `<body>`** are both fine. A root layout can render into `<head>`.
- **Keep blocks lean.** Like anything rendered by a Server Component, the JSON appears twice in the
  HTML: once in the block and once in the RSC payload.
- **No CSP nonce needed.** A data block never runs, so script-src doesn't apply to it.

## API

```ts
import { JsonLd, ref, serialize, type Node, type Nodes, type Ref } from "ldgraph";
import { check, type Issue, type Rule } from "ldgraph/check";
```

### `<JsonLd graph={nodes} />`

Renders one `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[…]}</script>`.
An empty graph renders nothing. `graph` takes:

- a node, or an array of nodes, nested as deep as you like;
- `null`, `undefined` or `false`, which are skipped, so `cond && node` works;
- a whole JSON-LD document `{ "@context", "@graph" }`, for example from a CMS.

It works in Server Components (it serializes on the server and sends only the string to a ~0.4 kB
client component), in Client Components, and in the Pages Router.

### `ref(node)`

Returns `{ "@id": node["@id"] }`. It takes the node rather than a string, so every reference points at an
imported definition: a typo is a compile error and "go to definition" works. A node without `@id` is a
type error. If the node's `@id` has a literal type (`` `${SITE}/#org` as const ``), the `Ref` keeps it.

### `serialize(graph)`

The string `JsonLd` renders, for anything outside React: route handlers, feeds, other renderers, tests.
It's pure and never logs. In order, it:

1. flattens arrays and `@graph` documents and drops `null`/`undefined`/`false`;
2. removes a node's `@context` when it is just schema.org (`http`/`https`, with or without `/`), and keeps
   any other;
3. merges nodes that share an `@id`: properties are combined, the first value wins on a conflict, and
   the merged node sits where the first one was;
4. wraps the result as `{"@context":"https://schema.org","@graph":[…]}`;
5. runs `JSON.stringify` and escapes `<`, `>`, `&`, U+2028 and U+2029 (see [Security](#security)).

Values follow JSON: `null` is kept, `undefined` and functions are dropped, `Date` and `URL` become
strings, and a `BigInt` or a cycle throws.

### `check(htmlOrDom)` from `ldgraph/check`

Reads every active JSON-LD block on a page, merges them as a JSON-LD processor would, and returns a list
of `Issue`s (`{ rule, message, id? }`), or `[]` for a clean page. Pass the HTML as a string, or a
`document`/element. See [Dev warnings](#dev-warnings) for the rules.

### Types, and `satisfies`

`Node` is deliberately minimal: an object with a `@type` (or an `@id` that adds to a node defined
elsewhere). The vocabulary comes from [schema-dts](https://github.com/google/schema-dts), which ldgraph
never imports; you check values with `satisfies`:

```ts
const org = { "@type": "Organization", "@id": `${SITE}/#organization`, nmae: "Example" } satisfies Organization;
//                                                                     ^^^^ error: did you mean "name"?
```

**Use `satisfies`, not an annotation.** `const org: Organization = …` widens the value to schema-dts's
union, which includes plain `string`, and ldgraph rejects it. `satisfies` checks the value and keeps its
literal shape. Both schema-dts 1.x and 2.x work.

## Testing your site

`check()` runs every rule over a whole page. Use it in any test runner:

```ts
import { check } from "ldgraph/check";

test("structured data is linked and valid", async () => {
  const html = await (await fetch("http://localhost:3000/blog/hello")).text();
  expect(check(html)).toEqual([]);
});
```

In Playwright, `check(await page.content())` checks the live DOM after navigation.

## Dev warnings

In development, ldgraph warns once per message in the terminal and in the browser console, for example
`[ldgraph] dangling-ref: https://example.com/#org (from https://example.com/blog/x#article.publisher)`.
Each rule runs in exactly one place, so nothing is reported twice. Production builds contain none of
this code.

| Rule | What it means | Where |
| --- | --- | --- |
| `relative-id` | An `@id` without a scheme (`#org`, `/about`). `_:` blank nodes are fine. | server |
| `conflict` | Two nodes with the same `@id` give one property different values. ldgraph keeps the first. | server (one block), browser (across blocks) |
| `product` | A Product needs `name` and one of `offers`, `review` or `aggregateRating` (Google's product snippet minimum). | server |
| `breadcrumb` | Every ListItem needs `position` and `name`; every one but the last needs `item`. | server |
| `dangling-ref` | A `{ "@id" }` reference to a node that no block on the page defines, on a site that does define nodes here. Links to other sites (Wikidata, …) are fine. | browser |
| `missing-type` | A node with no `@type` after merging the page, or a node with neither `@id` nor `@type`. | browser |
| `missing-context` | A block with no `@context` (hand-written or third-party blocks; ldgraph's always have one). | browser |
| `invalid-json` | A block that isn't valid JSON. | browser |

ldgraph doesn't validate the vocabulary or try to be a Rich Results validator: that changes too often,
and [Google's Rich Results Test](https://search.google.com/test/rich-results) is the authority.

## Security

Text inside `<script>` is not HTML-escaped by the browser: the element ends at the first `</script`
followed by a space, `/` or `>`, in any case, and `<!--` changes how the tokenizer reads what follows.
So any string your graph carries from a CMS or a user can break out of the block unless it is escaped.

ldgraph escapes `<`, `>`, `&`, U+2028 and U+2029 as `\u003c`, `\u003e`, `\u0026`, `\u2028` and
`\u2029`, the same set Next.js uses for its own inline data. These characters can only appear inside
JSON strings, where the escape decodes back to the original character, so:

- **it is safe**: no `<` ever reaches the HTML, so no end tag, comment or CDATA marker can form;
- **it is lossless**: `JSON.parse` of the block gives back exactly the data you passed in.

Other common approaches fall short of one or the other. Replacing only `</script>` misses
`</script >`, `</SCRIPT/` and similar spellings. Escaping strings as HTML entities (`&amp;`, `&lt;`) is
safe but changes your data, because nothing decodes entities inside a script. ldgraph's test suite runs
these inputs, and more, through a spec-compliant HTML parser.

Rendering uses `dangerouslySetInnerHTML` with the escaped string, never React's own text escaping, so the
output is the same on React 18 and 19.

## Cache Components and hidden routes

With Cache Components (`cacheComponents: true`, the create-next-app default), Next keeps up to three
previous routes in the DOM, hidden inside React `<Activity>`. Their JSON-LD blocks would stay in the
document, so analytics tags, browser extensions and agents reading the live DOM would see the previous
pages' Articles alongside the current one.

ldgraph handles this. While a route is hidden, its blocks get the type `text/x-ldgraph-inactive`; when
the route is shown again they switch back to `application/ld+json`. Crawlers load pages fresh and see
plain blocks; the server HTML is the same as a hand-written `<script>`.

## Pages Router, CMS JSON-LD, other React apps

- **Pages Router**: the same component works in `pages/*.tsx` on React 18.3 or 19. Each page is the
  whole tree, so pass the whole graph from the page (one block).
- **CMS or headless JSON-LD**: `graph={await res.json()}` accepts a whole `{ "@context", "@graph" }`
  document and merges it with your own nodes. A CMS `@context` other than schema.org is kept, on its nodes.
- **Other React apps**: `JsonLd` is plain React and should work in any RSC host (React Router, Waku) and
  in client-rendered apps, but only Next.js is tested. Outside React, use `serialize()`.

## Google notes

- Google's [Rich Results Test](https://search.google.com/test/rich-results) is the authority. Paste a
  page's HTML into its Code tab to test without deploying.
- Google documents linking items with `@id`, but none of its examples spans two script blocks. Whether
  it joins nodes across blocks is the one open question; the result will be recorded in
  [docs/verification.md](docs/verification.md). Until then, keep rich-result properties on the page's
  own node (see [Rules of thumb](#rules-of-thumb)), or use one block per page for pages that need rich
  results.
- FAQ and HowTo markup no longer produces rich results for most sites, so ldgraph has no special support
  for them.

## Migrating from a hand-written `<script>`

```tsx
// Before
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
/>

// After
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
