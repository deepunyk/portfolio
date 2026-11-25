import type { Metadata } from "next";
import Link from "next/link";

import { formatPostDate, getAllPostsMeta } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Writing",
  description: "Write-ups of production bugs, integration quirks, and tooling changes from my own work.",
};

export default function BlogPage() {
  const posts = getAllPostsMeta();

  return (
    <main className="mx-auto w-full max-w-[640px] flex-1 px-5 pt-16 pb-20 md:pt-24">
      <Link href="/" className="text-sm text-[var(--muted)] hover:text-[var(--accent)]">
        ← Deepak Nayak
      </Link>
      <h1 className="mt-8 text-3xl">Writing</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted)]">
        Write-ups of production bugs, integration quirks, and tooling changes from my own work,
        mostly at ClearFeed.
      </p>

      <ul className="mt-10">
        {posts.map((post) => {
          const meta = post.externalUrl
            ? `${formatPostDate(post.date)}${post.source ? ` · ${post.source} ↗` : ""}`
            : `${formatPostDate(post.date)}${post.readingMinutes ? ` · ${post.readingMinutes} min` : ""}`;
          const body = (
            <>
              <p className="font-mono text-xs text-[var(--faint)]">{meta}</p>
              <h2 className="mt-1.5 font-sans text-[17px] leading-snug font-medium tracking-normal group-hover:text-[var(--accent)]">
                {post.title}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{post.description}</p>
            </>
          );
          const className = "group block border-t border-[var(--border)] py-5";
          return (
            <li key={post.slug}>
              {post.externalUrl ? (
                <a href={post.externalUrl} target="_blank" rel="noopener noreferrer" className={className}>
                  {body}
                </a>
              ) : (
                <Link href={`/blog/${post.slug}`} className={className}>
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
