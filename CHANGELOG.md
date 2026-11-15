# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- `<JsonLd graph>` and `serialize()` accept a CMS's JSON-LD document as is, typed the way an SDK types
  parsed JSON: `JsonValue[] | { [key: string]: JsonValue }` (the Drupal Canvas SDK's type for
  `head.script[].textContent`), `Record<string, unknown>`, an array of these, and every JSON-LD shape
  (`@context` + `@graph`, a single node, an `@id`-only node). Before, `Nodes` required a top-level
  `@type`, `@id` or `@graph`, so `<JsonLd graph={script.textContent} />` failed to type-check. Authored
  nodes are checked exactly as before: only index-signature types match the new member.
- `examples/drupal-canvas` types the content API response the way the Canvas SDK does, instead of
  letting `JSON.parse`'s `any` hide the mismatch, and passes `textContent` straight to `<JsonLd>`.

### Added

- `JsonLdDocument`: the type of a JSON-LD document typed as plain JSON, now part of `Nodes`.
- A dev warning when `<JsonLd>` skips a value that is not a node, such as a string or `true` inside a
  CMS's array. `serialize()` still drops such values silently, and falsy values are still skipped
  without a warning.

- `examples/drupal-canvas`: a Next.js front end that renders a Drupal Canvas content API page's head
  and JSON-LD graph with `<JsonLd>`, and a `verify` script that checks the served graph against the
  API's.
- `test/jsonld.test.ts`: checks with jsonld.js, the JSON-LD reference processor, that the blocks the
  example app serves form the same dataset as the same nodes in one block.
- `docs/verification.md`: the evidence so far. Google's Schema Markup Validator joins a Product split
  across blocks. The Rich Results Test has not been run on split blocks yet, so the README still
  advises keeping rich-result properties on the page's own node.

## [0.1.0]

First release.

### Added

- `<JsonLd graph>`: renders one safe `application/ld+json` block from Server Components, Client
  Components or the Pages Router. In the browser a block is active only while React shows it: blocks
  of hidden content (routes that Cache Components keeps, `<Activity mode="hidden">`, a Suspense
  boundary showing its fallback again) have an inactive type.
- `ref(node)`: a typed `{ "@id" }` reference to an imported node.
- `serialize(graph)`: flattens arrays and `@graph` documents, strips a schema.org `@context`, merges
  nodes that share an `@id` and a `@context`, and escapes `< > & U+2028 U+2029` losslessly.
- `Nodes` accepts plain object literals and values annotated with schema-dts types
  (`WithContext<Product>`, `Article`), and the falsy results of `cond && node` for any `cond`.
- `check(html | dom)` from `jsonld-stitch/check`: whole-page rules (`invalid-json`, `missing-context`,
  `missing-type`, `relative-id`, `dangling-ref`, `conflict`, `product`, `breadcrumb`) for tests. HTML
  is read the way a browser tokenizes it.
- Dev-only warnings for the same rules, split between server and browser so none is reported twice,
  with a hint on how to fix each and a "did you mean" for dangling refs.
