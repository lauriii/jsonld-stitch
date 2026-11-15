import { ALL, blocksOf, lint } from "./lint.js";
import type { Issue } from "./types.js";

export type { Issue, Rule } from "./types.js";

// A <script> whose type is application/ld+json (any case, quoted or not), up to its end tag.
const BLOCK = /<script\b[^>]*?\stype\s*=\s*(["']?)application\/ld\+json\1(?=[\s/>])[^>]*>([\s\S]*?)<\/script[\s/]*>/gi;

/**
 * Checks every JSON-LD block on a page together, with every rule, and returns the issues (`[]` when
 * the page is clean). Pass the page's HTML, or a DOM (`document`, an element) for anything exotic.
 *
 * @example expect(check(await (await fetch(url)).text())).toEqual([])
 */
export function check(
  source: string | { querySelectorAll(selector: string): ArrayLike<{ textContent: string | null }> },
): Issue[] {
  return lint(typeof source === "string" ? Array.from(source.matchAll(BLOCK), (m) => m[2] ?? "") : blocksOf(source), ALL);
}
