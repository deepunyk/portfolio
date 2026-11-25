import Image from "next/image";
import Link from "next/link";

import { education, profile, timeline, work } from "@/content/site";
import { formatPostDate, getAllPostsMeta } from "@/lib/blog";

export default function Home() {
  const allPosts = getAllPostsMeta();
  const latestPosts = allPosts.slice(0, 3);
  const postTitle = (slug: string) =>
    allPosts.find((post) => post.slug === slug)?.title ?? slug;

  return (
    <div className="relative overflow-x-clip pb-16">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-8 md:px-10">
        <p className="text-sm font-medium tracking-[0.22em] text-[#3f4b57] uppercase">
          {profile.name}
        </p>
        <nav className="flex items-center gap-4 text-sm text-[#3f4b57] md:gap-6">
          <a href="#work" className="hover:text-[var(--accent)]">
            Work
          </a>
          <a href="#writing" className="hover:text-[var(--accent)]">
            Writing
          </a>
          <a href="#about" className="hover:text-[var(--accent)]">
            About
          </a>
          <Link href="/blog" className="hidden hover:text-[var(--accent)] md:inline">
            Blog
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 md:px-10">
        <section className="reveal surface-strong grid gap-10 rounded-3xl p-8 md:grid-cols-[1.3fr_0.95fr] md:p-10">
          <div className="space-y-6">
            <p className="inline-flex rounded-full border border-[var(--border)] bg-[var(--highlight)] px-3 py-1 text-xs font-medium tracking-wide text-[var(--accent)] uppercase">
              {profile.role}
            </p>
            <h1 className="max-w-3xl text-[2.4rem] leading-tight md:text-[3.5rem]">
              {profile.summary}
            </h1>
            <div className="max-w-2xl space-y-4 text-lg leading-relaxed text-[var(--muted)]">
              <p>{profile.detail}</p>
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href="/blog"
                className="rounded-full bg-[var(--foreground)] px-5 py-2.5 text-sm font-medium text-[var(--surface)] hover:bg-[#26323c]"
              >
                Read the blog
              </Link>
              <a
                href={`mailto:${profile.email}`}
                className="rounded-full border border-[var(--border)] px-5 py-2.5 text-sm font-medium hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                Email me
              </a>
              <a
                href={profile.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-2 text-sm text-[var(--muted)] underline-offset-4 hover:text-[var(--accent)] hover:underline"
              >
                LinkedIn
              </a>
              {profile.github.map((account) => (
                <a
                  key={account.url}
                  href={account.url}
                  title={account.title}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-2 text-sm text-[var(--muted)] underline-offset-4 hover:text-[var(--accent)] hover:underline"
                >
                  {account.label}
                </a>
              ))}
            </div>
          </div>
          <div className="surface relative overflow-hidden rounded-[2rem] p-3">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(15,118,110,0.2),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(241,216,164,0.26),transparent_30%)]" />
            <Image
              src="/deepak-nayak.png"
              alt="Deepak Nayak smiling in a blue shirt."
              width={768}
              height={768}
              priority
              className="relative aspect-[4/5] w-full rounded-[1.5rem] object-cover object-center"
            />
            <div className="relative mx-4 mt-4 rounded-2xl border border-white/50 bg-[rgba(255,249,238,0.92)] px-4 py-3 shadow-[0_10px_30px_rgba(22,32,39,0.12)] md:absolute md:inset-x-7 md:bottom-7 md:mx-0 md:mt-0 md:bg-[rgba(255,249,238,0.88)] md:backdrop-blur">
              <p className="text-[11px] font-medium tracking-[0.18em] text-[var(--muted)] uppercase">
                Based in {profile.location}
              </p>
            </div>
          </div>
        </section>

        <section id="work" className="reveal space-y-6 pt-8">
          <h2 className="text-3xl md:text-4xl">What I&apos;ve built</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {work.map((item) => (
              <article key={item.title} className="surface rounded-2xl p-6">
                <h3 className="text-2xl">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{item.description}</p>
                {item.posts.length > 0 ? (
                  <ul className="mt-4 space-y-1 text-sm">
                    {item.posts.map((slug) => (
                      <li key={slug}>
                        <Link
                          href={`/blog/${slug}`}
                          className="text-[var(--accent)] underline-offset-4 hover:text-[var(--accent-strong)] hover:underline"
                        >
                          {postTitle(slug)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section id="writing" className="reveal space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-2">
              <h2 className="text-3xl md:text-4xl">Latest writing</h2>
              <p className="text-sm text-[var(--muted)]">
                Write-ups of production bugs, integration quirks, and tooling
                changes from my own work.
              </p>
            </div>
            <Link
              href="/blog"
              className="text-sm font-medium text-[var(--accent)] hover:text-[var(--accent-strong)]"
            >
              See all posts
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {latestPosts.map((post) =>
              post.externalUrl ? (
                <a
                  key={post.slug}
                  href={post.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="surface group rounded-2xl p-5"
                >
                  <p className="text-xs tracking-wider text-[var(--muted)] uppercase">
                    {formatPostDate(post.date)}
                    {post.source ? ` | ${post.source}` : ""}
                  </p>
                  <h3 className="mt-3 text-2xl group-hover:text-[var(--accent)]">{post.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{post.description}</p>
                </a>
              ) : (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="surface group rounded-2xl p-5"
                >
                  <p className="text-xs tracking-wider text-[var(--muted)] uppercase">
                    {formatPostDate(post.date)}
                    {post.readingMinutes ? ` | ${post.readingMinutes} min read` : ""}
                  </p>
                  <h3 className="mt-3 text-2xl group-hover:text-[var(--accent)]">{post.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{post.description}</p>
                </Link>
              ),
            )}
          </div>
        </section>

        <section className="reveal space-y-6" id="about">
          <h2 className="text-3xl md:text-4xl">Where I&apos;ve worked</h2>
          <div className="space-y-4">
            {timeline.map((entry) => (
              <article
                key={`${entry.company}-${entry.title}`}
                className="surface rounded-2xl p-6 md:grid md:grid-cols-[280px_1fr] md:gap-6"
              >
                <div>
                  <p className="text-xs tracking-[0.15em] text-[var(--muted)] uppercase">
                    {entry.company}
                  </p>
                  <h3 className="mt-2 text-2xl">{entry.title}</h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">{entry.period}</p>
                </div>
                <div className="mt-4 text-sm leading-7 text-[var(--muted)] md:mt-0">
                  <p>{entry.detail}</p>
                  {entry.post ? (
                    <Link
                      href={`/blog/${entry.post}`}
                      className="mt-2 inline-block text-[var(--accent)] underline-offset-4 hover:text-[var(--accent-strong)] hover:underline"
                    >
                      {postTitle(entry.post)}
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}
            <article className="surface rounded-2xl p-6 md:grid md:grid-cols-[280px_1fr] md:gap-6">
              <div>
                <p className="text-xs tracking-[0.15em] text-[var(--muted)] uppercase">
                  Education
                </p>
                <h3 className="mt-2 text-2xl">{education.degree}</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">{education.period}</p>
              </div>
              <p className="mt-4 text-sm leading-7 text-[var(--muted)] md:mt-0">
                {education.school}
              </p>
            </article>
          </div>
        </section>

        <section className="reveal surface-strong rounded-3xl p-8 md:p-10">
          <h2 className="text-3xl md:text-4xl">Contact</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)]">
            Email is the best way to reach me:{" "}
            <a
              href={`mailto:${profile.email}`}
              className="text-[var(--accent)] underline-offset-4 hover:underline"
            >
              {profile.email}
            </a>
            . I&apos;m happy to talk about event pipelines, integrations, AI
            agents in production, or anything I&apos;ve written here.
          </p>
        </section>
      </main>
    </div>
  );
}
