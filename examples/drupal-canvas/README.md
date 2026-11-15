# ldgraph with a Drupal Canvas site

A minimal Next.js App Router front end for a Drupal site that runs Canvas and exposes the Canvas
content API. Every path is passed to the API, and the page renders what the API's `head` holds:

- `head.title`, `head.meta` and `head.link` as React 19 `<title>`, `<meta>` and `<link>` elements
  (React hoists them into `<head>`);
- each `head.script` of type `application/ld+json` with `<JsonLd graph={textContent} />`. The CMS's
  `{ "@context", "@graph" }` document is passed as is: ldgraph escapes it and renders it, and the
  served block parses back to exactly the API's graph.

Rendering the page's components is out of scope; the page shows its title only.

## Run it

```sh
npm install
echo 'CANVAS_CONTENT_API_BASE=https://cms.example.com' > .env.local   # your Drupal site's origin
npm run build && npm start
```

`CANVAS_CONTENT_API_BASE` has no default. The app fetches
`{CANVAS_CONTENT_API_BASE}/canvas/content-api?requestUri=/the/path` on every request (`no-store`);
without the variable it shows a page that asks for it, and `next build` needs no CMS.

## Check it against the API

With the app running, `scripts/verify.mjs` fetches each path from both the API and the app and
checks that:

- the app's JSON-LD blocks parse back to exactly the API's `head.script` documents (deep equal);
- no block contains a raw `<`, `>`, `&`, U+2028 or U+2029 (CMS text such as `fish & chips <fresh>`
  arrives as `&` and `<` escapes, and round-trips);
- `check()` from `ldgraph/check` finds no issues on the page;
- the API's title, meta and link tags are in the HTML.

```sh
CANVAS_CONTENT_API_BASE=https://cms.example.com npm run verify -- / /about /blog/some-post
# APP=http://localhost:3000 is the default; OUT=./out saves each page's HTML and a JSON comparison.
```

It exits non-zero when any path fails.
