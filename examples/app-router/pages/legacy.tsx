import type { WebPage } from "schema-dts";
import { JsonLd, ref } from "ldgraph";
import { SITE, organization, website } from "@/lib/graph";

// Pages Router: each page is the whole tree, so it renders the whole graph in one block.
export default function Legacy() {
  return (
    <main>
      <JsonLd
        graph={[
          organization,
          website,
          {
            "@type": "WebPage",
            "@id": `${SITE}/legacy#webpage`,
            url: `${SITE}/legacy`,
            name: "Pages Router",
            isPartOf: ref(website),
          } satisfies WebPage,
        ]}
      />
      <h1>Pages Router</h1>
    </main>
  );
}
