import type { NextConfig } from "next";

// Cache Components is what create-next-app generates today: PPR plus <Activity> route preservation,
// which keeps up to 3 previous routes (and their JSON-LD blocks) in the DOM. LDGRAPH_CC=0 builds the
// classic model that most existing apps use.
const cacheComponents = process.env.LDGRAPH_CC !== "0";

export default {
  ...(cacheComponents ? { cacheComponents: true, partialPrefetching: true } : {}),
} satisfies NextConfig;
