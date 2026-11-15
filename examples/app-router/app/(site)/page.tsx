import type { WebPage } from "schema-dts";
import { JsonLd, ref } from "jsonld-stitch";
import { SITE, website } from "@/lib/graph";

export default function Home() {
  return (
    <main>
      <JsonLd
        graph={{
          "@type": "WebPage",
          "@id": `${SITE}/#webpage`,
          url: SITE,
          name: "Home",
          isPartOf: ref(website),
        } satisfies WebPage}
      />
      <h1>Home</h1>
    </main>
  );
}
