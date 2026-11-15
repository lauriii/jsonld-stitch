import { JsonLd } from "jsonld-stitch";
import { blog } from "@/lib/graph";

// Nested layout: the section's own node. It survives navigations between posts.
export default function BlogLayout({ children }: LayoutProps<"/blog">) {
  return (
    <section>
      <JsonLd graph={blog} />
      {children}
    </section>
  );
}
