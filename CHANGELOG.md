# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0]

First release.

### Added

- `<JsonLd graph>`: renders one safe `application/ld+json` block from Server Components, Client
  Components or the Pages Router. Blocks of routes that Cache Components hides switch to an inactive
  type until the route is shown again.
- `ref(node)`: a typed `{ "@id" }` reference to an imported node.
- `serialize(graph)`: flattens arrays and `@graph` documents, strips a schema.org `@context`, merges
  nodes by `@id` and escapes `< > & U+2028 U+2029` losslessly.
- `check(html | dom)` from `ldgraph/check`: whole-page rules (`invalid-json`, `missing-context`,
  `missing-type`, `relative-id`, `dangling-ref`, `conflict`, `product`, `breadcrumb`) for tests.
- Dev-only warnings for the same rules, split between server and browser so none is reported twice.
