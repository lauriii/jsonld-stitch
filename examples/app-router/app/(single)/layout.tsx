import type { Metadata } from "next";

export const metadata: Metadata = { title: "jsonld-stitch example: one block" };

// A second root layout that renders no JSON-LD, for pages that put the whole graph in one block.
export default function SingleBlockLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
