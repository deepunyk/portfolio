import type { Components } from "react-markdown";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { formatPostDate, getAllPostsMeta, getPostBySlug } from "@/lib/blog";

type PageProps = {
  params: Promise<{ slug: string }>;
};

const markdownComponents: Components = {
  h2: ({ children }) => <h2 className="mt-10 text-3xl">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-8 text-2xl">{children}</h3>,
  p: ({ children }) => (
    <p className="mt-4 text-[15px] leading-8 text-[var(--muted)]">{children}</p>
  ),
  ul: ({ children }) => <ul className="mt-4 list-disc space-y-2 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="mt-4 list-decimal space-y-2 pl-6">{children}</ol>,
  li: ({ children }) => <li className="text-[15px] leading-8 text-[var(--muted)]">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="mt-5 border-l-2 border-[var(--accent)] pl-4 text-[15px] italic text-[var(--muted)]">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => {
    const external = href?.startsWith("http");
    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className="font-medium text-[var(--accent)] underline decoration-[var(--border)] underline-offset-4 hover:text-[var(--accent-strong)]"
      >
        {children}
      </a>
    );
  },
  code: ({ children, className }) => {
    if (className) {
      return (
        <code className={`${className} rounded-md bg-[#20262d] px-1.5 py-1 text-[#f2f5f7]`}>
          {children}
        </code>
      );
    }
    return <code className="rounded bg-[#f4ecdf] px-1.5 py-0.5 text-sm">{children}</code>;
  },
  pre: ({ children }) => (
    <pre className="mt-4 overflow-x-auto rounded-2xl bg-[#20262d] p-4 text-sm text-[#f2f5f7]">
      {children as ReactNode}
    </pre>
  ),
};

export function generateStaticParams() {
  return getAllPostsMeta()
    .filter((post) => !post.externalUrl)
    .map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    return {
      title: "Post Not Found",
    };
  }

  return {
    title: post.title,
    description: post.description,
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-12 md:px-10">
      <Link href="/blog" className="text-sm text-[var(--muted)] hover:text-[var(--accent)]">
        Back to blog
      </Link>

      <article className="surface mt-6 rounded-3xl p-6 md:p-10">
        <header className="border-b border-[var(--border)] pb-8">
          <p className="text-xs tracking-wider text-[var(--muted)] uppercase">
            {formatPostDate(post.date)} | {post.readingMinutes} min read
          </p>
          <h1 className="mt-3 text-4xl leading-tight md:text-5xl">{post.title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--muted)]">
            {post.description}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span
                key={`${post.slug}-${tag}`}
                className="rounded-full bg-[var(--highlight)] px-3 py-1 text-xs text-[var(--accent)]"
              >
                {tag}
              </span>
            ))}
          </div>
        </header>

        <div className="pt-6">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {post.content}
          </ReactMarkdown>
        </div>
      </article>
    </main>
  );
}
