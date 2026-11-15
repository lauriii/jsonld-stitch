import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "jsonld-stitch";
import { organization, website } from "@/lib/graph";

export const metadata: Metadata = { title: "jsonld-stitch example" };

// Root layout: the site-wide nodes, rendered once into <head>. Pages link to them by @id.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <head>
        <JsonLd graph={[organization, website]} />
      </head>
      <body>
        <nav>
          <Link href="/">Home</Link> · <Link href="/blog">Blog</Link> · <Link href="/blog/hello">Hello</Link> ·{" "}
          <Link href="/blog/other">Other</Link> · <Link href="/blog/dynamic">Dynamic</Link> ·{" "}
          <Link href="/blog/streamed">Streamed</Link> · <Link href="/shop/widget">Widget</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
