import type { BlogPosting, BreadcrumbList } from "schema-dts";
import { ref } from "jsonld-stitch";
import { SITE, blog, organization } from "@/lib/graph";

/** A post's own nodes. Rich-result fields live on the post; site relationships are refs. */
export function postGraph(
  path: string,
  post: { title: string; publishedAt: string; author: string },
  section: { readonly "@id": string } = blog,
) {
  const url = `${SITE}${path}`;
  return [
    {
      "@type": "BlogPosting",
      "@id": `${url}#article`,
      url,
      headline: post.title,
      datePublished: post.publishedAt,
      author: { "@type": "Person", name: post.author },
      publisher: ref(organization),
      isPartOf: ref(section),
    } satisfies BlogPosting,
    {
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE },
        { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE}/blog` },
        { "@type": "ListItem", position: 3, name: post.title },
      ],
    } satisfies BreadcrumbList,
  ];
}
