import Image from "next/image";
import Link from "next/link";

import { profile, work } from "@/content/site";
import { getAllPostsMeta } from "@/lib/blog";

function shortDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function PostLink({ slug, children }: { slug: string; children: React.ReactNode }) {
  return (
    <Link href={`/blog/${slug}`} className="prose-link">
      {children}
    </Link>
  );
}

export default function Home() {
  const posts = getAllPostsMeta();
  const latestPosts = posts.slice(0, 7);
  const postTitle = (slug: string) => posts.find((post) => post.slug === slug)?.title ?? slug;

  return (
    <main className="mx-auto w-full max-w-[640px] flex-1 px-5 pt-16 pb-20 md:pt-24">
      <header className="flex items-center gap-4">
        <Image
          src="/deepak-nayak.png"
          alt="Deepak Nayak"
          width={112}
          height={112}
          priority
          className="h-14 w-14 rounded-full object-cover"
        />
        <div>
          <h1 className="text-2xl leading-tight">{profile.name}</h1>
          <p className="text-sm text-[var(--muted)]">Backend engineer, {profile.location}</p>
        </div>
      </header>

      <section className="mt-10 space-y-5 text-[16px] leading-[1.75]">
        <p>
          I work on the backend of ClearFeed, which turns Slack and Teams conversations into
          support tickets. A lot of that is plumbing between other people&apos;s APIs, and most of
          what I know came from the plumbing breaking: a{" "}
          <PostLink slug="slack-connect-the-one-event-problem">
            Slack event that arrived once for two installs
          </PostLink>
          , a <PostLink slug="the-sqs-long-poll-that-never-came-back">long poll that never returned</PostLink>
          , a{" "}
          <PostLink slug="claiming-scheduled-work-atomically-so-concurrent-runs-do-not-duplicate">
            scheduler that fired the same job twice
          </PostLink>
          . I write some of it up <Link href="/blog" className="prose-link">here</Link>.
        </p>
        <p>
          I started that backend from an empty repo in 2021, back when I was the only engineer.
          It&apos;s the same codebase today, with a backend team of 15 that I lead.
        </p>
        <p>
          <span className="font-mono text-xs tracking-wider text-[var(--faint)] uppercase">
            Now
          </span>{" "}
          Most of my time goes to AI agents that resolve support requests by themselves, about 40%
          of incoming tickets, including real actions like resetting an Okta password. The rest goes
          to working out how a team should run when{" "}
          <PostLink slug="rethinking-typescript-checks-for-agentic-development">
            coding agents write the first draft
          </PostLink>{" "}
          of most changes.
        </p>
      </section>

      <section className="mt-16">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl">Writing</h2>
          <Link href="/blog" className="text-sm text-[var(--muted)] hover:text-[var(--accent)]">
            All {posts.length} posts →
          </Link>
        </div>
        <ul className="mt-4">
          {latestPosts.map((post) => {
            const className = "group flex gap-4 border-t border-[var(--border)] py-3 sm:gap-6";
            const body = (
              <>
                <span className="w-[4.5rem] shrink-0 pt-0.5 font-mono text-xs text-[var(--faint)]">
                  {shortDate(post.date)}
                </span>
                <span className="text-[15px] leading-snug group-hover:text-[var(--accent)]">
                  {post.title}
                  {post.externalUrl && post.source ? (
                    <span className="text-[var(--faint)]"> · {post.source} ↗</span>
                  ) : null}
                </span>
              </>
            );
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
      </section>

      <section className="mt-16">
        <h2 className="text-xl">Work</h2>
        <ul className="mt-4">
          {work.map((entry) => (
            <li
              key={`${entry.org}-${entry.title}`}
              className="flex flex-col gap-1 border-t border-[var(--border)] py-4 sm:flex-row sm:gap-6"
            >
              <span className="w-[6.5rem] shrink-0 pt-0.5 font-mono text-xs text-[var(--faint)]">
                {entry.period}
              </span>
              <div>
                <p className="text-[15px]">
                  {entry.title} <span className="text-[var(--muted)]">· {entry.org}</span>
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
                  {entry.detail}
                  {entry.post ? (
                    <>
                      {" "}
                      <PostLink slug={entry.post}>{postTitle(entry.post)}</PostLink>
                    </>
                  ) : null}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-16 border-t border-[var(--border)] pt-6 text-sm text-[var(--muted)]">
        <p>
          The best way to reach me is email:{" "}
          <a href={`mailto:${profile.email}`} className="prose-link">
            {profile.email}
          </a>
        </p>
        <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
          {profile.links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              title={link.title}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--accent)]"
            >
              {link.label}
            </a>
          ))}
        </p>
      </footer>
    </main>
  );
}
