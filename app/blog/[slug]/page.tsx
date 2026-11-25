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
  h2: ({ children }) => <h2 className="mt-12 text-2xl">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-8 text-xl">{children}</h3>,
  p: ({ children }) => <p className="mt-5 text-[16px] leading-[1.8]">{children}</p>,
  ul: ({ children }) => <ul className="mt-5 list-disc space-y-2 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="mt-5 list-decimal space-y-2 pl-6">{children}</ol>,
  li: ({ children }) => <li className="text-[16px] leading-[1.8]">{children}</li>,
  table: ({ children }) => (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-[var(--border)] py-2 pr-4 text-left font-medium">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-b border-[var(--border)] py-2 pr-4 align-top text-[var(--muted)]">
      {children}
    </td>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mt-5 border-l-2 border-[var(--border)] pl-4 italic text-[var(--muted)]">
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
        className="prose-link"
      >
        {children}
      </a>
    );
  },
  code: ({ children, className }) => {
    if (className) {
      return <code className={className}>{children}</code>;
    }
    return <code className="rounded bg-[var(--code-bg)] px-1.5 py-0.5 text-[0.85em]">{children}</code>;
  },
  pre: ({ children }) => (
    <pre className="mt-5 overflow-x-auto rounded-lg bg-[var(--pre-bg)] p-4 text-sm leading-relaxed text-[var(--pre-fg)] [&_code]:bg-transparent [&_code]:p-0">
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
    <main className="mx-auto w-full max-w-[640px] flex-1 px-5 pt-16 pb-20 md:pt-24">
      <Link href="/blog" className="text-sm text-[var(--muted)] hover:text-[var(--accent)]">
        ← Writing
      </Link>

      <article className="mt-8">
        <header className="border-b border-[var(--border)] pb-8">
          <p className="font-mono text-xs text-[var(--faint)]">
            {formatPostDate(post.date)} · {post.readingMinutes} min read
          </p>
          <h1 className="mt-3 text-3xl leading-tight md:text-4xl">{post.title}</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-[var(--muted)]">{post.description}</p>
        </header>

        <div className="pt-2">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {post.content}
          </ReactMarkdown>
        </div>
      </article>

      <footer className="mt-16 border-t border-[var(--border)] pt-6 text-sm text-[var(--muted)]">
        <Link href="/" className="hover:text-[var(--accent)]">
          Deepak Nayak
        </Link>{" "}
        · backend engineer in Bengaluru
      </footer>
    </main>
  );
}
