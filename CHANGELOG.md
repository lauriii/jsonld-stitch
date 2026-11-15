# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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
- `check(html | dom)` from `ldgraph/check`: whole-page rules (`invalid-json`, `missing-context`,
  `missing-type`, `relative-id`, `dangling-ref`, `conflict`, `product`, `breadcrumb`) for tests. HTML
  is read the way a browser tokenizes it.
- Dev-only warnings for the same rules, split between server and browser so none is reported twice,
  with a hint on how to fix each and a "did you mean" for dangling refs.
