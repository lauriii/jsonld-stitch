"use client";
// The only client code ldgraph ships. Server output is a plain data block; this component only
// switches its type while React <Activity> hides the route (Next keeps up to 3 hidden routes in
// the DOM with Cache Components), so a hidden page's block stops being JSON-LD for live-DOM readers.
import { createElement, useEffect, useRef, type ReactElement } from "react";

let timer: ReturnType<typeof setTimeout> | undefined;

export function Script({ json }: { json: string }): ReactElement {
  const el = useRef<HTMLScriptElement>(null);
  useEffect(() => {
    const script = el.current;
    if (!script) return;
    script.type = "application/ld+json";
    if (process.env.NODE_ENV !== "production") {
      // Dev only: once the page settles, check every active block on it together.
      clearTimeout(timer);
      timer = setTimeout(() => {
        void import("./lint.js").then(({ lint, report, blocksOf, BROWSER }) => report(lint(blocksOf(document), BROWSER)));
      }, 500);
    }
    // Deliberately not containing "ld+json", so even a loose [type*="ld+json"] selector skips it.
    return () => void (script.type = "text/x-ldgraph-inactive");
  }, []);
  return createElement("script", { ref: el, type: "application/ld+json", dangerouslySetInnerHTML: { __html: json } });
}
