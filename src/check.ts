import { ALL, blocksOf, lint, type Root } from "./lint.js";
import type { Issue } from "./types.js";

export type { Issue, Rule } from "./types.js";

/**
 * Checks every JSON-LD block on a page together, with every rule, and returns the issues (`[]` when
 * the page is clean). Pass the page's HTML, or a DOM (`document`, an element) for anything exotic.
 *
 * @example expect(check(await (await fetch(url)).text())).toEqual([])
 */
export function check(source: string | Root): Issue[] {
  return lint(typeof source === "string" ? scripts(source) : blocksOf(source), ALL);
}

// Just enough of the HTML tokenizer to find script elements the way a browser does, in one pass:
// comments and other markup declarations are skipped, a quoted attribute value may hold ">", the
// text of raw-text elements is never read as tags, and <template> content is not part of the page.
// Each of these runs to the end of the input when it is never closed, as in a browser.
const COMMENT = /<!--(?:-?>|[\s\S]*?(?:--!?>|$))/y;
const BOGUS = /<(?:[!?]|\/(?![a-z]))[^>]*>?/iy;
const TAG = /<(\/?)([a-z][^\s/>]*)/iy;
const ATTR = /[\s/]*([^\s/>][^\s/>=]*)(?:\s*=\s*(?:"([^"]*)(?:"|$)|'([^']*)(?:'|$)|([^\s>]*)))?/y;
const END = /[\s/]*>/y;
const RAW = new Set(["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes"]);

/** The text of every `<script type="application/ld+json">` in `html` (type in any case, unquoted too). */
function scripts(html: string): string[] {
  const out: string[] = [];
  let templates = 0;
  const at = (re: RegExp, i: number): RegExpExecArray | null => ((re.lastIndex = i), re.exec(html));
  for (let i = html.indexOf("<"); i !== -1; i = html.indexOf("<", i)) {
    const skip = at(COMMENT, i) ?? at(BOGUS, i);
    if (skip) {
      i += skip[0].length;
      continue;
    }
    const tag = at(TAG, i);
    if (!tag) {
      i++;
      continue;
    }
    let type: string | undefined;
    let p = TAG.lastIndex;
    for (let attr; (attr = at(ATTR, p)); p = ATTR.lastIndex) {
      if (attr[1]!.toLowerCase() === "type") type ??= attr[2] ?? attr[3] ?? attr[4] ?? "";
    }
    if (!at(END, p)) break; // the tag never closes
    i = END.lastIndex;
    const name = tag[2]!.toLowerCase();
    if (name === "template") templates = Math.max(0, templates + (tag[1] ? -1 : 1));
    if (tag[1] || !RAW.has(name)) continue;
    // Raw text runs to the first matching end tag; nothing inside it is markup.
    const close = new RegExp(`</${name}[\\s/>]`, "gi");
    close.lastIndex = i;
    const end = close.exec(html)?.index ?? html.length;
    if (name === "script" && !templates && type?.toLowerCase() === "application/ld+json") out.push(html.slice(i, end));
    i = end;
  }
  return out;
}
