import { notFound } from "next/navigation";
import { JsonLd } from "ldgraph";
import { API_BASE, getPage, jsonLdDocuments } from "@/lib/content-api";

// Every path is passed through to the content API. The CMS owns the head, so this page renders
// the API's title, meta and link tags as React 19 elements (React hoists them into <head>) and each
// JSON-LD document with <JsonLd>, which escapes it. The graph itself is used as is.
export default async function CanvasPage({ params }: PageProps<"/[[...slug]]">) {
  if (!API_BASE) {
    return (
      <main>
        <h1>Set CANVAS_CONTENT_API_BASE</h1>
        <p>Point it at a Drupal site with the Canvas content API, e.g. in .env.local.</p>
      </main>
    );
  }

  const { slug = [] } = await params;
  const page = await getPage(`/${slug.join("/")}`);
  if (!page) notFound();
  const head = page.head ?? {};

  return (
    <main>
      {head.title ? <title>{head.title}</title> : null}
      {head.meta?.map((m, i) => <meta key={i} {...m} />)}
      {head.link?.map(({ hreflang, ...l }, i) => <link key={i} {...l} hrefLang={hreflang} />)}
      {jsonLdDocuments(page).map((doc, i) => (
        <JsonLd key={i} graph={doc} />
      ))}
      <h1>{page.context?.page?.pageTitle ?? head.title}</h1>
    </main>
  );
}
