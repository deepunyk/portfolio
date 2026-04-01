import Image from "next/image";
import Link from "next/link";

import { focusAreas, profile, timeline } from "@/content/site";
import { formatPostDate, getAllPostsMeta } from "@/lib/blog";

export default function Home() {
  const latestPosts = getAllPostsMeta().slice(0, 3);

  return (
    <div className="relative overflow-x-clip pb-16">
      <div className="pointer-events-none absolute inset-x-0 -top-56 h-80 bg-[radial-gradient(circle,rgba(15,118,110,0.2)_0%,rgba(15,118,110,0)_72%)]" />
      <div className="pointer-events-none absolute -left-14 top-44 h-44 w-44 rounded-full bg-[radial-gradient(circle,#f9ecd2_0%,rgba(249,236,210,0)_70%)]" />
      <div className="pointer-events-none absolute -right-10 top-[26rem] h-48 w-48 rounded-full bg-[radial-gradient(circle,#deece3_0%,rgba(222,236,227,0)_72%)]" />

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
            <h1 className="max-w-3xl text-4xl leading-tight md:text-6xl">
              I like taking fuzzy product problems and turning them into systems people can rely on.
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-[var(--muted)]">
              {profile.summary}
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <a
                href={profile.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-[var(--foreground)] px-5 py-2.5 text-sm font-medium text-[var(--surface)] hover:bg-[#26323c]"
              >
                LinkedIn
              </a>
              <a
                href={`mailto:${profile.email}`}
                className="rounded-full border border-[var(--border)] px-5 py-2.5 text-sm font-medium hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                Email Me
              </a>
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
              <p className="mt-1 text-sm leading-6 text-[var(--foreground)]">
                I like backend work with awkward edges, system boundaries that
                need care, and products people end up depending on every day.
              </p>
            </div>
          </div>
        </section>

        <section id="work" className="reveal space-y-6">
          <div className="space-y-3">
            <h2 className="text-3xl md:text-4xl">The Work I Keep Getting Pulled Toward</h2>
            <p className="max-w-2xl text-[var(--muted)]">
              Usually it is a product sitting in the middle of too many systems,
              some operational mess no one wants to think about, and a team
              trying to move quickly without making the whole thing fragile.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {focusAreas.map((area) => (
              <article key={area.title} className="surface rounded-2xl p-6">
                <h3 className="text-2xl">{area.title}</h3>
                <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{area.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="reveal space-y-6" id="about">
          <h2 className="text-3xl md:text-4xl">A Few Stops Along The Way</h2>
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
                <p className="mt-4 text-sm leading-7 text-[var(--muted)] md:mt-0">
                  {entry.detail}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section id="writing" className="reveal space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-2">
              <h2 className="text-3xl md:text-4xl">Latest Writing</h2>
              <p className="text-sm text-[var(--muted)]">
                Notes on backend engineering, AI workflows, product building,
                and the parts of the job I keep coming back to.
              </p>
            </div>
            <Link href="/blog" className="text-sm font-medium text-[var(--accent)] hover:text-[var(--accent-strong)]">
              See all posts
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {latestPosts.map((post) => (
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
              )
            ))}
          </div>
        </section>

        <section className="reveal surface-strong rounded-3xl p-8 text-center md:p-10">
          <p className="text-sm tracking-[0.18em] text-[var(--muted)] uppercase">
            Say Hello
          </p>
          <h2 className="mt-3 text-3xl md:text-4xl">
            If you are building something thoughtful, I would love to hear about it.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[var(--muted)]">
            I am based in {profile.location}. I like difficult engineering
            problems, small teams with trust, and products that become part of
            someone&apos;s daily work.
          </p>
          <a
            href={`mailto:${profile.email}`}
            className="mt-6 inline-flex rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
          >
            Reach Out
          </a>
        </section>
      </main>
    </div>
  );
}
