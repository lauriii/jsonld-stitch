"use client";
// The only client code jsonld-stitch ships. The server renders a plain data block for crawlers. In the
// browser a block is JSON-LD only while it is shown: React <Activity> keeps hidden routes in the DOM
// (Next keeps up to 3 with Cache Components), and a hidden page's block must not read as page data.
import { createElement, useEffect, useLayoutEffect, useRef, type ReactElement } from "react";

const ACTIVE = "application/ld+json";
// Deliberately not containing "ld+json", so even a loose [type*="ld+json"] selector skips it.
const INACTIVE = "text/x-jsonld-stitch-inactive";
const server = typeof document === "undefined";
// A layout effect is cleaned up whenever React hides its content: <Activity>, and a Suspense boundary
// that shows its fallback again. The server branch only avoids React 18's useLayoutEffect warning.
const useShown = server ? useEffect : useLayoutEffect;

let timer: ReturnType<typeof setTimeout> | undefined;

export function Script({ json }: { json: string }): ReactElement {
  const el = useRef<HTMLScriptElement>(null);
  useShown(() => {
    const script = el.current!; // a child's ref is attached before its parent's layout effect runs
    script.type = ACTIVE;
    if (process.env.NODE_ENV !== "production") {
      // Dev only: once the page settles, check every active block on it together.
      clearTimeout(timer);
      timer = setTimeout(() => {
        void import("./lint.js").then(({ lint, report, blocksOf, BROWSER }) => report(lint(blocksOf(document), BROWSER)));
      }, 500);
    }
    return () => void (script.type = INACTIVE);
  }, []);
  // A block the browser creates starts inactive, and only the effect activates it: React runs no
  // effects for content that mounts hidden. Hydration keeps the server's type attribute, so the
  // expected difference is not a mismatch.
  return createElement("script", {
    ref: el,
    type: server ? ACTIVE : INACTIVE,
    suppressHydrationWarning: true,
    dangerouslySetInnerHTML: { __html: json },
  });
}
