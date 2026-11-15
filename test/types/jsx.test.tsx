// The feedback that led to JsonLdDocument, reproduced as written: a Drupal Canvas SDK head.script
// entry's textContent, passed straight to <JsonLd>. The SDK's JSON type is declared here, not imported.
import { JsonLd } from "jsonld-stitch";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type HeadScript = { type: string; textContent: JsonValue[] | { [key: string]: JsonValue } };

declare const script: HeadScript;
declare const scripts: HeadScript[];

export const one = <JsonLd graph={script.textContent} />;
export const all = scripts
  .filter((s) => s.type === "application/ld+json")
  .map((s, i) => <JsonLd key={i} graph={s.textContent} />);
export const merged = <JsonLd graph={[{ "@type": "WebSite", "@id": "https://example.com/#website" }, script.textContent]} />;

// @ts-expect-error authored nodes are still checked: a node needs a @type or an @id
export const untyped = <JsonLd graph={{ name: "x" }} />;
// @ts-expect-error a whole textContent that is a JSON string must be parsed first
export const text = <JsonLd graph={"{}"} />;
