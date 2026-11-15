# Design notes

## Why linked blocks, not one script

A package can't merge every segment's nodes into one `<script>` correctly. A layout can't see its
children, renders in parallel with them, and isn't re-rendered when you navigate between its children.
Any collector either emits too early (in a layout) or misses the layouts (in the page), and on a client
navigation the layouts' code doesn't run at all. That only shows up in production builds.

Linked blocks have none of these problems: each one is correct on its own, and JSON-LD 1.1 §7 reads
every `application/ld+json` block on a page into one dataset.

## Merging

- **Within one block**, `serialize()` merges nodes that share an `@id` and a `@context`. Properties are
  combined and the first value wins, so a block never says two things about one property. A dev
  `conflict` warning shows when values differ.
- **Across blocks**, ldgraph controls nothing: a JSON-LD processor keeps every value, so the page's
  graph holds both. `check()` and the browser's `conflict` warning flag this.
- **Different contexts** are never merged: under a context with its own `@vocab`, the same keys mean
  different things.
- **Named graphs** (`{ "@id": g, "@type": …, "@graph": […] }`) are read as a node plus the nodes of its
  graph, all in the block's one graph. A `@graph` with only an `@id` is just a document.

## Hidden content

React can keep content in the DOM while it is hidden:

- with Cache Components (`cacheComponents: true`, the create-next-app default), Next keeps up to three
  previous routes, hidden inside `<Activity>`;
- an `<Activity mode="hidden">` in your own code (prerendered tabs, wizards);
- a Suspense boundary that shows its fallback again keeps the old content, hidden.

A hidden page's block would otherwise stay in the document, so analytics tags, browser extensions and
agents reading the live DOM would see a previous page's Article alongside the current one.

So in the browser, a block is `application/ld+json` only while React shows it, and
`text/x-ldgraph-inactive` (which deliberately doesn't contain `ld+json`) otherwise:

- The server renders an active block, so crawlers and the first paint see a plain data block.
- Hydration keeps the server's attribute.
- A block the browser creates starts inactive, and a layout effect activates it. React runs no effects
  for content that mounts hidden, so such a block stays inactive until it is shown.
- The layout effect's cleanup deactivates it whenever React hides the content again, including behind a
  Suspense fallback (a passive effect would miss that case).

The browser test suite covers each of these in Chromium, and the e2e suite checks client navigation in
a Next app with Cache Components on and off.

Parallel and intercepted routes (a modal over a page) show both pages, so both pages' blocks are
active. Crawlers load the canonical URL, where only one is rendered.
