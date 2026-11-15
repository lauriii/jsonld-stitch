// React 18.3 turns string children of <script> into HTML entities, which corrupts JSON-LD. ldgraph
// renders through dangerouslySetInnerHTML, so the output must be byte-identical to React 19's.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, version } from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { JsonLd, ref, serialize } from "ldgraph";

const SITE = "https://example.com";
const org = { "@type": "Organization", "@id": `${SITE}/#organization`, name: "</script><!-- & \u2028 ]]>" };
const graph = [org, { "@type": "WebSite", "@id": `${SITE}/#website`, publisher: ref(org) }];

test("runs on React 18.3", () => {
  assert.match(version, /^18\.3\./);
});

test("renders exactly one data block with the serialized graph", () => {
  const expected = `<script type="application/ld+json">${serialize(graph)}</script>`;
  assert.equal(renderToString(createElement(JsonLd, { graph })), expected);
  assert.equal(renderToStaticMarkup(createElement(JsonLd, { graph })), expected);
});

test("round-trips the data exactly", () => {
  const html = renderToString(createElement(JsonLd, { graph: org }));
  const json = html.slice(html.indexOf(">") + 1, -"</script>".length);
  assert.deepEqual(JSON.parse(json)["@graph"], [org]);
});

test("renders nothing for an empty graph", () => {
  assert.equal(renderToString(createElement(JsonLd, { graph: [] })), "");
});
