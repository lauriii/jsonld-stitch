# Verification: does Google join `@id`s across script blocks?

Status: **not yet run.** This is a manual step before 1.0. It needs a person with a browser.

## Why it matters

ldgraph renders one block per layout or page and links them by absolute `@id`. JSON-LD 1.1 says all
blocks on a page form one dataset, and Google's docs say to link items with `@id`, but none of Google's
examples spans two `<script>` elements. The answer decides which pattern the README leads with:

- **Joined:** multi-block (one block per segment) stays the default.
- **Not joined:** one block per page becomes the documented default for pages that need rich results.
  The API does not change.

## Procedure

1. `npm run build && npm run test:e2e` (or `next build && next start` in `examples/app-router`).
2. Save the served HTML of `/blog/hello` (view source, or `curl`).
3. Paste it into the Code tab of [Google's Rich Results Test](https://search.google.com/test/rich-results)
   and into [validator.schema.org](https://validator.schema.org/).
4. Record below whether BlogPosting's `publisher` resolves to the Organization defined in the root
   layout's block (the tools show the referenced node's properties, not just the `@id`).

## Result

| Date | Tool | Next | `publisher` resolved across blocks? | Notes |
| --- | --- | --- | --- | --- |
| | Rich Results Test | | | |
| | validator.schema.org | | | |

## The JSON-LD reference processor (automated)

`test/jsonld.test.ts` runs [jsonld.js](https://github.com/digitalbazaar/jsonld.js), the reference
processor, over HTML the example app serves from `next build` (saved in `test/fixtures/app-router`;
the e2e run fails if the build stops serving those blocks) and over the README's example, rendered.
It runs in `npm test`, offline, in well under a second. It settles what the spec says, not what
Google does:

- **Read as JSON-LD 1.1 §7.3 describes** (each block processed, then merged into one dataset): the
  blocks form one default graph. A node split over blocks (`/split`: a Product in one block, its
  `offers` and `review` in two others) is one node with every property; every `ref()` resolves to a
  node with a `@type`; and the canonical (RDFC-1.0) dataset equals the same nodes in one block.
- **Read by the literal API algorithm** (JSON-LD 1.1 API §9.4.1 with `extractAllScripts`, as the W3C
  test `html/r004` pins down): a block written as `{"@context", "@graph"}`, which is how `serialize()`
  writes every block, becomes its own graph named by a blank node. The triples are the same, but they
  sit in one named graph per block and none in the default graph, so a consumer that reads only the
  default graph, or one graph at a time, does not see the split Product as one node. A block whose
  content is an array of nodes, each with its own `@context`, stays in the default graph.
