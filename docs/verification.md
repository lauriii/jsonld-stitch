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
