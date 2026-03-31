import type { Metadata } from "next";
import Link from "next/link";

import { formatPostDate, getAllPostsMeta } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog",
  description: "Engineering notes on backend systems, AI workflows, and product execution.",
};

export default function BlogPage() {
  const posts = getAllPostsMeta();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-12 md:px-10">
      <header className="space-y-3">
        <Link href="/" className="text-sm text-[var(--muted)] hover:text-[var(--accent)]">
          Back to home
        </Link>
        <h1 className="text-4xl md:text-5xl">Writing</h1>
        <p className="max-w-2xl text-sm leading-7 text-[var(--muted)]">
          Practical notes from building backend-heavy products, integrating AI into workflows,
          and shipping with startup constraints.
        </p>
      </header>

      <section className="space-y-4">
        {posts.map((post) => (
          <article key={post.slug} className="surface rounded-2xl p-5 md:p-6">
            <p className="text-xs tracking-wider text-[var(--muted)] uppercase">
              {formatPostDate(post.date)} | {post.readingMinutes} min read
            </p>
            <h2 className="mt-3 text-3xl">
              <Link href={`/blog/${post.slug}`} className="hover:text-[var(--accent)]">
                {post.title}
              </Link>
            </h2>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{post.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <span
                  key={`${post.slug}-${tag}`}
                  className="rounded-full bg-[var(--highlight)] px-3 py-1 text-xs text-[var(--accent)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
