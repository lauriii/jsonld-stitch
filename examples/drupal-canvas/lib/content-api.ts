// The Drupal Canvas content API: GET {base}/canvas/content-api?requestUri=/path returns the page's
// component tree plus its <head>: title, meta, link and script (the SEO module's JSON-LD graph).
// The types below describe the response the way the Canvas SDK does: JSON-LD is plain JSON.

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type HeadMeta = { name?: string; property?: string; content: string };
export type HeadLink = { rel: string; href: string; hreflang?: string };
export type HeadScript = { type: string; textContent: JsonValue[] | { [key: string]: JsonValue } };

export type CanvasPage = {
  head?: { title?: string; meta?: HeadMeta[]; link?: HeadLink[]; script?: HeadScript[] };
  context?: { page?: { pageTitle?: string } };
};

/** The API's origin, e.g. https://cms.example.com. Unset by default: set it in .env.local. */
export const API_BASE = process.env.CANVAS_CONTENT_API_BASE?.replace(/\/+$/, "");

/** The page at `path`, or null when the API says it doesn't exist (404). */
export async function getPage(path: string): Promise<CanvasPage | null> {
  if (!API_BASE) throw new Error("Set CANVAS_CONTENT_API_BASE to the Drupal site's origin.");
  const url = `${API_BASE}/canvas/content-api?requestUri=${encodeURIComponent(path)}`;
  const res = await fetch(url, { cache: "no-store", headers: { accept: "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Content API ${res.status} for ${path}`);
  const page: CanvasPage = await res.json();
  return page;
}

/** The head.script entries that hold JSON-LD. Each one's textContent goes to <JsonLd graph> as is. */
export function jsonLdScripts(page: CanvasPage): HeadScript[] {
  return (page.head?.script ?? []).filter((s) => s.type === "application/ld+json");
}
