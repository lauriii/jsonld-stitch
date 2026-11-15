// Stand-in for a CMS or database. Async, so pages and layouts await it like real data.
const posts: Record<string, { title: string; publishedAt: string; author: string }> = {
  hello: { title: "Hello, linked data", publishedAt: "2026-11-01", author: "Ada" },
  other: { title: "Rendered on demand", publishedAt: "2026-11-02", author: "Grace" },
};

export async function getPost(slug: string) {
  return posts[slug] ?? null;
}

export async function getShop() {
  return { name: "Example Shop", description: "Things we sell." };
}

// What the XSS fixture puts in a headline: every way out of a <script> element at once.
export const XSS = "</script><script>alert(1)</script> </SCRIPT ><!-- x --> </script/ \u2028\u2029 & ]]>";
