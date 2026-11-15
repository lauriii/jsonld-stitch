import { connection } from "next/server";
import { JsonLd } from "ldgraph";
import { postGraph } from "@/lib/article";

// Rendered per request, streamed in after loading.tsx.
export default async function DynamicPost() {
  await connection();
  await new Promise((resolve) => setTimeout(resolve, 30));
  return (
    <article>
      <JsonLd graph={postGraph("/blog/dynamic", { title: "Rendered per request", publishedAt: "2026-11-03", author: "Ada" })} />
      <h1>Rendered per request</h1>
    </article>
  );
}
