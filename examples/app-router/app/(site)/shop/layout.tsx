import type { CollectionPage } from "schema-dts";
import { JsonLd, ref } from "jsonld-stitch";
import { getShop } from "@/lib/data";
import { SITE, website } from "@/lib/graph";

// An async layout: it contributes its node only after an await. Its block still lands in the page.
export default async function ShopLayout({ children }: LayoutProps<"/shop">) {
  const shop = await getShop();
  return (
    <section>
      <JsonLd
        graph={{
          "@type": "CollectionPage",
          "@id": `${SITE}/shop#collection`,
          url: `${SITE}/shop`,
          name: shop.name,
          description: shop.description,
          isPartOf: ref(website),
        } satisfies CollectionPage}
      />
      {children}
    </section>
  );
}
