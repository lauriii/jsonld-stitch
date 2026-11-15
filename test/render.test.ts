import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { prerender } from "react-dom/static";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JsonLd, ref, serialize, type Nodes } from "../src/index.ts";

const SITE = "https://example.com";
const LS = String.fromCharCode(0x2028);
const org = { "@type": "Organization", "@id": `${SITE}/#organization`, name: `</script><script>alert(1)</script>${LS} & ]]>` };
const website = { "@type": "WebSite", "@id": `${SITE}/#website`, publisher: ref(org) };
const graph = [org, website, { "@id": org["@id"], url: SITE }];

/** Exactly what any React version must render: one data block holding `serialize(graph)`. */
const expected = (g: Nodes) => `<script type="application/ld+json">${serialize(g)}</script>`;

async function prerenderToString(g: Nodes): Promise<string> {
  const { prelude } = await prerender(createElement(JsonLd, { graph: g }));
  return new Response(prelude).text();
}

describe("JsonLd (React 19 SSR)", () => {
  it("renders exactly one data block with the serialized graph", async () => {
    expect(renderToString(createElement(JsonLd, { graph }))).toBe(expected(graph));
    expect(await prerenderToString(graph)).toBe(expected(graph));
  });

  it("renders nothing for an empty graph", async () => {
    for (const empty of [[], null, false, [undefined, []], { "@graph": [] }] as Nodes[]) {
      expect(renderToString(createElement(JsonLd, { graph: empty }))).toBe("");
    }
    expect(await prerenderToString([])).toBe("");
  });

  it("round-trips the data exactly", () => {
    const html = renderToString(createElement(JsonLd, { graph: org }));
    const json = html.slice(html.indexOf(">") + 1, html.lastIndexOf("</script>"));
    expect(JSON.parse(json)["@graph"][0]).toEqual(org);
  });
});

describe("ref", () => {
  it("returns just the @id", () => {
    expect(ref(org)).toEqual({ "@id": org["@id"] });
    expect(Object.keys(ref(org))).toEqual(["@id"]);
  });
});

describe("dev warnings", () => {
  const env = process.env.NODE_ENV;
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    process.env.NODE_ENV = env;
    warn.mockRestore();
  });
  const render = (g: Nodes) => renderToString(createElement(JsonLd, { graph: g }));
  const lines = () => warn.mock.calls.map((c: unknown[]) => c.join(" "));

  it("warns on the server rules, once for the several renders of a page, with a hint", () => {
    process.env.NODE_ENV = "development";
    const bad = [
      { "@type": "Product", "@id": "#widget" },
      { "@id": "#widget", name: "A" },
      { "@id": "#widget", name: "B" },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home" }, { "@type": "ListItem", position: 2, name: "Here" }] },
      // Whole-page rules belong to the browser, so the server stays quiet about these:
      { "@type": "Thing", "@id": `${SITE}/#t`, about: { "@id": `${SITE}/#nowhere` } },
      { "@id": `${SITE}/#untyped`, name: "u" },
    ] as Nodes;
    const html = render(bad);
    render(bad);
    // A conflict inside one block keeps the first value.
    expect(JSON.parse(html.slice(html.indexOf(">") + 1, -"</script>".length))["@graph"][0].name).toBe("A");
    expect(lines()).toEqual([
      "[ldgraph] relative-id: #widget (use an absolute @id such as https://your.site/page#name: a relative one is a different node on every URL)",
      '[ldgraph] conflict: #widget name: "A" vs "B" (give the property one value: across blocks the page\'s graph holds both)',
      "[ldgraph] product: #widget needs offers, review or aggregateRating",
      "[ldgraph] breadcrumb: BreadcrumbList item 1 needs an item URL",
    ]);
  });

  it("warns again about an issue that went away and came back", () => {
    process.env.NODE_ENV = "development";
    vi.useFakeTimers();
    try {
      const bad = { "@type": "Thing", "@id": "#again" } as Nodes;
      render(bad);
      vi.advanceTimersByTime(1_000);
      render(bad); // the same page rendering again: quiet
      vi.advanceTimersByTime(3_000);
      render(bad); // fixed and reintroduced, or a later visit: warns again
      expect(lines().filter((l: string) => l.startsWith("[ldgraph] relative-id: #again "))).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("warns when ref() gets a node without an @id, and shows the node", () => {
    process.env.NODE_ENV = "development";
    const node = { "@type": "Thing" } as unknown as { "@id": string };
    expect(ref(node)).toEqual({ "@id": undefined });
    expect(warn.mock.calls).toEqual([["[ldgraph] ref() needs a node with an @id, but got:", node]]);
  });

  it("is silent in production", () => {
    process.env.NODE_ENV = "production";
    render([{ "@type": "Product", "@id": "#silent" }]);
    ref({} as { "@id": string });
    expect(warn).not.toHaveBeenCalled();
  });
});
