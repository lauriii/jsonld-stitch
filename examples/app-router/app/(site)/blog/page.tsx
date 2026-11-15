import Link from "next/link";

// No JSON-LD of its own: the page gets the root and blog layouts' blocks.
export default function BlogIndex() {
  return (
    <main>
      <h1>Blog</h1>
      <ul>
        <li>
          <Link href="/blog/hello">Hello, linked data</Link>
        </li>
        <li>
          <Link href="/blog/other">Rendered on demand</Link>
        </li>
      </ul>
    </main>
  );
}
