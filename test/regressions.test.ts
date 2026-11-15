// Defects found by the 0.1.0 adversarial review, each pinned by a test that failed before its fix.
import { describe, expect, it } from "vitest";
import { check } from "../src/check.ts";
import { serialize, type Nodes } from "../src/index.ts";

const SITE = "https://example.com";
const graphOf = (graph: Nodes): Record<string, unknown>[] => JSON.parse(serialize(graph))["@graph"];
const org = { "@type": "Organization", "@id": `${SITE}/#organization`, name: "Example" };

describe("serialize drops nodes that carry a @graph key", () => {
  it("keeps a node whose @graph is undefined (JSON semantics: an undefined key is just absent)", () => {
    // `"@graph" in node` is true for an explicit undefined, so the whole WebPage disappears.
    const page = { "@type": "WebPage", "@id": `${SITE}/#webpage`, name: "Home", "@graph": undefined };
    expect(graphOf(page)).toEqual([{ "@type": "WebPage", "@id": `${SITE}/#webpage`, name: "Home" }]);
  });

  it("does not silently discard a typed node that also has a @graph (the Node type accepts it)", () => {
    const page = { "@type": "WebPage", "@id": `${SITE}/#webpage`, name: "Home", "@graph": [org] } satisfies Nodes;
    const ids = graphOf(page).map((n) => n["@id"]);
    expect(ids).toContain(`${SITE}/#webpage`);
  });
});

describe("merging by @id moves a foreign @context onto another node", () => {
  it("does not merge nodes whose effective @context differs", () => {
    // The partial node's @vocab would re-map the Organization's `@type` and `name` to another vocabulary.
    const ctx = { "@vocab": "https://vocab.example/#" };
    const partial = { "@context": ctx, "@id": org["@id"], internalCode: 7 };
    const out = graphOf([org, partial]);
    const schemaNode = out.find((n) => n["name"] === "Example")!;
    expect(schemaNode["@context"]).toBeUndefined();
  });
});

describe("check() parsing of script tags", () => {
  const bad = `{"@context":"https://schema.org","@type":"Thing","@id":"#relative"}`;

  it("finds a block when an earlier attribute value contains '>' (otherwise a broken page passes)", () => {
    expect(check(`<script data-note="a>b" type="application/ld+json">${bad}</script>`).map((i) => i.rule)).toEqual(["relative-id"]);
  });

  it("reads the right content when a later attribute value contains '>'", () => {
    expect(check(`<script type="application/ld+json" data-note="a>b">${bad}</script>`).map((i) => i.rule)).toEqual(["relative-id"]);
  });

  it("ignores blocks inside HTML comments and <template>, which no consumer reads", () => {
    expect(check(`<!-- <script type="application/ld+json">{oops</script> -->`)).toEqual([]);
    expect(check(`<template><script type="application/ld+json">${bad}</script></template>`)).toEqual([]);
  });
});

describe("conflict false positives", () => {
  const block = (graph: unknown[]) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph })}</script>`;

  it("treats @type (an unordered set in JSON-LD) as equal in any order", () => {
    expect(check(block([{ "@id": `${SITE}/#a`, "@type": ["Organization", "Brand"] }, { "@id": `${SITE}/#a`, "@type": ["Brand", "Organization"] }]))).toEqual([]);
  });

  it("does not compare a property against Object.prototype (constructor, toString, ...)", () => {
    expect(check(block([{ "@id": `${SITE}/#a`, "@type": "Thing", name: "n" }, { "@id": `${SITE}/#a`, constructor: "c" }]))).toEqual([]);
  });
});

describe("named graphs and falsy values", () => {
  it("does not turn a graph-only @id into a bare reference node", () => {
    expect(graphOf({ "@context": "https://schema.org", "@id": `${SITE}/#graph`, "@graph": [org] } as Nodes)).toEqual([org]);
  });

  it("drops the falsy values of cond && node for strings and numbers too", () => {
    const slug = "" as string;
    const count = 0 as number;
    expect(graphOf([slug && org, count && org])).toEqual([]);
  });

  it("check() reads a named graph like serialize() does", () => {
    const text = JSON.stringify({ "@context": "https://schema.org", "@type": "WebPage", "@id": `${SITE}/#webpage`, "@graph": [org] });
    expect(check(`<script type="application/ld+json">${text}</script>`)).toEqual([]);
  });
});

describe("check() reads HTML like a browser", () => {
  const bad = `{"@context":"https://schema.org","@type":"Thing","@id":"#relative"}`;
  const block = `<script type="application/ld+json">${bad}</script>`;

  it("treats an unclosed comment as running to the end", () => {
    expect(check(`<!-- a > b ${block}`)).toEqual([]);
    expect(check(`<!--> ${block}`).map((i) => i.rule)).toEqual(["relative-id"]);
  });

  it("never reads raw text as tags", () => {
    expect(check(`<style>/* ${block} */</style>`)).toEqual([]);
    expect(check(`<textarea>${block}</textarea>`)).toEqual([]);
    expect(check(`<script>const s = '${block.replace("</script>", "<\\/script>")}'</script>`)).toEqual([]);
  });

  it("does not mistake an attribute value for the type", () => {
    expect(check(`<script data-x=' type=application/ld+json '>let x = 1</script>`)).toEqual([]);
    expect(check(`<script type="module" data-type="application/ld+json">${bad}</script>`)).toEqual([]);
  });

  it("reads a block that is never closed to the end, and stays linear", () => {
    expect(check(`<script type=application/ld+json>${bad}`).map((i) => i.rule)).toEqual(["relative-id"]);
    const start = performance.now();
    check("<script type=application/ld+json>".repeat(20_000));
    check(`<p title="${"<a ".repeat(20_000)}`);
    expect(performance.now() - start).toBeLessThan(200);
  });
});

describe("rules", () => {
  const block = (graph: unknown[]) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph })}</script>`;

  it("missing-type: an empty @type array is no type", () => {
    expect(check(block([{ "@type": [], name: "n" }])).map((i) => i.rule)).toEqual(["missing-type"]);
    expect(check(block([{ "@id": `${SITE}/#a`, "@type": [], name: "n" }])).map((i) => i.rule)).toEqual(["missing-type"]);
  });

  it("dangling-ref: suggests the defined @id it most likely meant", () => {
    const page = block([org, { "@type": "WebSite", "@id": `${SITE}/#website`, publisher: { "@id": `${SITE}/#org` }, about: { "@id": `${SITE}/#organisation` } }]);
    expect(check(page).map((i) => i.message)).toEqual([
      `${SITE}/#org (from ${SITE}/#website.publisher); did you mean ${SITE}/#organization?`,
      `${SITE}/#organisation (from ${SITE}/#website.about); did you mean ${SITE}/#organization?`,
    ]);
    expect(check(block([org, { "@type": "Thing", "@id": `${SITE}/#t`, x: { "@id": `${SITE}/#unrelated` } }]))[0]?.message).toBe(
      `${SITE}/#unrelated (from ${SITE}/#t.x)`,
    );
  });

  it("conflict: a single value equals a one-element array", () => {
    expect(check(block([{ ...org, sameAs: "https://x.example" }, { "@id": org["@id"], sameAs: ["https://x.example"] }]))).toEqual([]);
  });
});
