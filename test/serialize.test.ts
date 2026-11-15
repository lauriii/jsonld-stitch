import { parse } from "parse5";
import { describe, expect, it } from "vitest";
import { serialize, type Nodes } from "../src/index.ts";

const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
const LONE_SURROGATE = String.fromCharCode(0xd800);

/** The `@graph` of a serialized block, parsed back. */
const graphOf = (graph: Nodes): unknown[] => JSON.parse(serialize(graph))["@graph"];

describe("serialize: escaping", () => {
  const corpus = [
    "</script>",
    "</SCRIPT >",
    "</script/",
    "</script\t>",
    "<script",
    "<!--<script>",
    "<!-- x -->",
    "]]>",
    `${LS}${PS}`,
    LONE_SURROGATE,
    "emoji 🎉 and ä",
    "Ben &amp; Jerry's",
    `quotes " ' and backslashes \\ \\\\`,
    // Inputs that break other serializers: case, space and slash variants of the end tag.
    "</script><img src=x onerror=alert(1)>",
    "</script ><img src=x onerror=alert(1)>",
    "</script/><img src=x onerror=alert(1)>",
    "</SCRIPT\t><b>x</b>",
    `</script><script>alert(1)</script> <!-- x --> ${LS}${PS} & ]]>`,
  ];

  it.each(corpus)("%j is safe and lossless", (input) => {
    const node = { "@type": "Thing", name: input, [input]: [input, { nested: input }] };
    const out = serialize(node);

    // 1. Nothing an HTML parser or a JavaScript engine could trip over.
    expect(out).not.toMatch(/[<>&\u2028\u2029]/);

    // 2. Lossless: parsing gives back exactly the input.
    expect(JSON.parse(out)).toEqual({ "@context": "https://schema.org", "@graph": [JSON.parse(JSON.stringify(node))] });

    // 3. A spec-compliant HTML parser sees one script holding exactly `out`, then the next element.
    const doc = parse(`<!doctype html><html><head></head><body><script type="application/ld+json">${out}</script><p id="after"></p></body></html>`);
    const body = (doc.childNodes[1] as any).childNodes[1];
    const [script, after] = body.childNodes;
    expect(body.childNodes).toHaveLength(2);
    expect(script.tagName).toBe("script");
    expect(script.childNodes[0].value).toBe(out);
    expect(after.tagName).toBe("p");
    expect(after.attrs).toEqual([{ name: "id", value: "after" }]);
  });

  it("uses the same escape sequences as Next.js", () => {
    const bs = "\\";
    expect(serialize({ "@type": "Thing", name: `<>&${LS}${PS}` })).toBe(
      `{"@context":"https://schema.org","@graph":[{"@type":"Thing","name":"${bs}u003c${bs}u003e${bs}u0026${bs}u2028${bs}u2029"}]}`,
    );
  });
});

describe("serialize: structure", () => {
  const a = { "@type": "Thing", "@id": "https://example.com/#a", name: "A" };
  const b = { "@type": "Thing", "@id": "https://example.com/#b", name: "B" };
  const c = { "@type": "Thing", name: "C" };

  it("wraps nodes in one schema.org @graph", () => {
    expect(serialize(a)).toBe(`{"@context":"https://schema.org","@graph":[${JSON.stringify(a)}]}`);
  });

  it("gives an empty @graph for empty input", () => {
    for (const empty of [[], null, undefined, false, [[], [null]], { "@graph": [] }] as Nodes[]) {
      expect(serialize(empty)).toBe(`{"@context":"https://schema.org","@graph":[]}`);
    }
  });

  it("flattens nested arrays and drops null, undefined and false", () => {
    const cond = false as boolean;
    expect(graphOf([a, null, [undefined, [b, cond && c]], false, [[c]]])).toEqual([a, b, c]);
  });

  it("flattens whole @graph documents, nested or not", () => {
    const doc = { "@context": "https://schema.org", "@graph": [a, { "@graph": [b] }] };
    expect(graphOf([doc, c])).toEqual([a, b, c]);
  });

  it("strips a @context that is just schema.org", () => {
    for (const ctx of ["https://schema.org", "https://schema.org/", "http://schema.org", "http://schema.org/"]) {
      expect(graphOf({ "@context": ctx, ...c })).toEqual([c]);
    }
  });

  it("keeps any other @context, and moves a document's onto its nodes", () => {
    const ctx = { "@vocab": "https://schema.org/", ex: "https://example.com/vocab#" };
    expect(graphOf({ "@context": ctx, ...c })).toEqual([{ "@context": ctx, ...c }]);
    expect(graphOf({ "@context": ctx, "@graph": [a, { "@context": "https://schema.org", ...b }] })).toEqual([
      { "@context": ctx, ...a },
      b,
    ]);
  });

  it("collapses identical duplicates by @id", () => {
    expect(graphOf([a, b, a, [a, b]])).toEqual([a, b]);
  });

  it("unions partial nodes into the first, in its position", () => {
    expect(graphOf([a, b, { "@id": a["@id"], logo: "https://example.com/logo.png" }])).toEqual([
      { ...a, logo: "https://example.com/logo.png" },
      b,
    ]);
    // A partial node that comes first still takes the position, and the full node fills it in.
    expect(graphOf([{ "@id": a["@id"], logo: "x" }, b, a])).toEqual([{ "@id": a["@id"], logo: "x", "@type": "Thing", name: "A" }, b]);
  });

  it("keeps the first value on a conflict", () => {
    expect(graphOf([a, { ...a, name: "Other", url: "u" }])).toEqual([{ ...a, url: "u" }]);
  });

  it("keeps nodes without an @id, in order, even when equal", () => {
    expect(graphOf([c, a, c])).toEqual([c, a, c]);
  });

  it("follows JSON semantics for values", () => {
    const when = new Date(Date.UTC(2026, 0, 2, 3, 4, 5));
    const node = {
      "@type": "Event",
      empty: null,
      gone: undefined,
      fn: () => 1,
      startDate: when,
      url: new URL("https://example.com/a b"),
    };
    expect(graphOf(node)).toEqual([
      { "@type": "Event", empty: null, startDate: "2026-01-02T03:04:05.000Z", url: "https://example.com/a%20b" },
    ]);
  });

  it("fills a key that the first node left undefined", () => {
    expect(graphOf([{ ...a, url: undefined }, { "@id": a["@id"], url: "u" }])).toEqual([{ ...a, url: "u" }]);
  });

  it("throws like JSON.stringify on BigInt and cycles", () => {
    expect(() => serialize({ "@type": "Thing", n: 1n })).toThrow(TypeError);
    const loop: Record<string, unknown> = { "@type": "Thing" };
    loop["self"] = loop;
    expect(() => serialize(loop as Nodes)).toThrow(TypeError);
  });

  it("never mutates its input", () => {
    const first = { ...a };
    const input = [first, { "@id": a["@id"], logo: "x" }, { "@context": "https://schema.org", ...b }];
    const before = structuredClone(input);
    serialize(input);
    expect(input).toEqual(before);
  });
});
