import { JsonLd } from "ldgraph";
import { postGraph } from "@/lib/article";
import { XSS } from "@/lib/data";
import { website } from "@/lib/graph";

// Test fixture: a headline that tries every way out of a <script>. It must round-trip exactly.
export default function Xss() {
  return (
    <article>
      <JsonLd graph={postGraph("/xss", { title: XSS, publishedAt: "2026-11-05", author: XSS }, website)} />
      <h1>{XSS}</h1>
    </article>
  );
}
