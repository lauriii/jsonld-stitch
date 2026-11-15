import type { Product } from "schema-dts";
import { JsonLd, ref } from "jsonld-stitch";
import { SITE, organization } from "@/lib/graph";

// Test fixture: one Product split over three blocks, as separate components would render it. The
// page block defines it; the offer and the reviews add to it by @id from blocks of their own.
// test/jsonld.test.ts proves a JSON-LD processor reads them as one node. Whether Google joins
// them is the open question in docs/verification.md.
const product = {
  "@type": "Product",
  "@id": `${SITE}/split#product`,
  url: `${SITE}/split`,
  name: "Split Widget",
  image: `${SITE}/widget.png`,
  brand: ref(organization),
  aggregateRating: { "@type": "AggregateRating", ratingValue: 4.5, reviewCount: 2 },
} satisfies Product;

function Offer() {
  return (
    <JsonLd
      graph={{
        "@id": product["@id"],
        offers: { "@type": "Offer", price: 12, priceCurrency: "EUR", availability: "https://schema.org/InStock" },
      }}
    />
  );
}

function Reviews() {
  return (
    <JsonLd
      graph={{
        "@id": product["@id"],
        review: [
          { "@type": "Review", author: { "@type": "Person", name: "Ada" }, reviewRating: { "@type": "Rating", ratingValue: 5 } },
          { "@type": "Review", author: { "@type": "Person", name: "Grace" }, reviewRating: { "@type": "Rating", ratingValue: 4 } },
        ],
      }}
    />
  );
}

export default function Split() {
  return (
    <main>
      <JsonLd graph={product} />
      <h1>Split Widget</h1>
      <Offer />
      <Reviews />
    </main>
  );
}
