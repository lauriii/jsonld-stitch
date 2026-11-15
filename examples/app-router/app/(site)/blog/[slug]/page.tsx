import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "ldgraph";
import { postGraph } from "@/lib/article";
import { getPost } from "@/lib/data";

// "hello" is prerendered at build time; "other" renders on demand.
export function generateStaticParams() {
  return [{ slug: "hello" }];
}

export async function generateMetadata({ params }: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const post = await getPost((await params).slug);
  return { title: post?.title };
}

export default async function Post({ params }: PageProps<"/blog/[slug]">) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();
  return (
    <article>
      <JsonLd graph={postGraph(`/blog/${slug}`, post)} />
      <h1>{post.title}</h1>
    </article>
  );
}
