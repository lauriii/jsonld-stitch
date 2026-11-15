import type { AboutPage } from "schema-dts";
import { JsonLd, ref } from "ldgraph";
import { SITE, organization, website } from "@/lib/graph";

// One block for the whole page: pass the site nodes along with the page's own.
export default function About() {
  return (
    <main>
      <JsonLd
        graph={[
          organization,
          website,
          {
            "@type": "AboutPage",
            "@id": `${SITE}/about#webpage`,
            url: `${SITE}/about`,
            name: "About",
            isPartOf: ref(website),
            about: ref(organization),
          } satisfies AboutPage,
        ]}
      />
      <h1>About</h1>
    </main>
  );
}
