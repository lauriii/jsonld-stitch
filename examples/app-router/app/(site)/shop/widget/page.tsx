import type { BreadcrumbList, Product } from "schema-dts";
import { JsonLd, ref } from "ldgraph";
import { SITE, organization } from "@/lib/graph";

const url = `${SITE}/shop/widget`;

export default function Widget() {
  return (
    <main>
      <JsonLd
        graph={[
          {
            "@type": "Product",
            "@id": `${url}#product`,
            url,
            name: "Widget",
            image: `${SITE}/widget.png`,
            brand: ref(organization),
            offers: { "@type": "Offer", price: 9.5, priceCurrency: "EUR", availability: "https://schema.org/InStock" },
          } satisfies Product,
          {
            "@type": "BreadcrumbList",
            "@id": `${url}#breadcrumb`,
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: SITE },
              { "@type": "ListItem", position: 2, name: "Shop", item: `${SITE}/shop` },
              { "@type": "ListItem", position: 3, name: "Widget" },
            ],
          } satisfies BreadcrumbList,
        ]}
      />
      <h1>Widget</h1>
    </main>
  );
}
