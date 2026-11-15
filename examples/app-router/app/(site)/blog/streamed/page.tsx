import { Suspense } from "react";
import { connection } from "next/server";
import { JsonLd } from "jsonld-stitch";
import { postGraph } from "@/lib/article";

// The page's nodes come from a child that streams in after the shell.
async function Late() {
  await connection();
  await new Promise((resolve) => setTimeout(resolve, 40));
  return (
    <>
      <JsonLd graph={postGraph("/blog/streamed", { title: "Streamed in", publishedAt: "2026-11-04", author: "Grace" })} />
      <p>Streamed in.</p>
    </>
  );
}

export default function StreamedPost() {
  return (
    <article>
      <h1>Streamed</h1>
      <Suspense fallback={<p>Waiting…</p>}>
        <Late />
      </Suspense>
    </article>
  );
}
