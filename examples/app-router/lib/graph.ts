// Site-wide nodes. A plain module: layouts and pages both import it, so they share ids, not state.
import type { Blog, Organization, WebSite } from "schema-dts";
import { ref } from "jsonld-stitch";

// Absolute ids: "#organization" on /a and on /b would be two different nodes.
export const SITE = "https://example.com";

export const organization = {
  "@type": "Organization",
  "@id": `${SITE}/#organization`,
  name: "Example",
  url: SITE,
  logo: `${SITE}/logo.png`,
} satisfies Organization;

export const website = {
  "@type": "WebSite",
  "@id": `${SITE}/#website`,
  url: SITE,
  name: "Example",
  publisher: ref(organization),
} satisfies WebSite;

export const blog = {
  "@type": "Blog",
  "@id": `${SITE}/blog#blog`,
  url: `${SITE}/blog`,
  name: "Example Blog",
  isPartOf: ref(website),
  publisher: ref(organization),
} satisfies Blog;
