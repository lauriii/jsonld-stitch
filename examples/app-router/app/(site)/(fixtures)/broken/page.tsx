import { JsonLd } from "ldgraph";
import { SITE } from "@/lib/graph";

// Test fixture: check() must report exactly one relative-id and one dangling-ref here.
export default function Broken() {
  return (
    <main>
      <JsonLd
        graph={{
          "@type": "WebPage",
          "@id": "#broken",
          name: "Broken",
          publisher: { "@id": `${SITE}/#nobody` },
        }}
      />
      <h1>Broken</h1>
    </main>
  );
}
