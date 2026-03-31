import fs from "node:fs";
import path from "node:path";

import matter from "gray-matter";
import readingTime from "reading-time";

const blogDirectory = path.join(process.cwd(), "content", "blog");

type BlogFrontMatter = {
  title: string;
  description: string;
  date: string;
  tags?: string[];
  published?: boolean;
};

export type BlogPostMeta = {
  slug: string;
  title: string;
  description: string;
  date: string;
  tags: string[];
  published: boolean;
  readingMinutes: number;
};

export type BlogPost = BlogPostMeta & {
  content: string;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

function getBlogFiles() {
  if (!fs.existsSync(blogDirectory)) {
    return [];
  }

  return fs
    .readdirSync(blogDirectory)
    .filter((fileName) => fileName.endsWith(".md"));
}

function toSlug(fileName: string) {
  return fileName.replace(/\.md$/, "");
}

function assertFrontMatter(slug: string, data: unknown): asserts data is BlogFrontMatter {
  if (!data || typeof data !== "object") {
    throw new Error(`Missing front matter in post: ${slug}`);
  }

  const fm = data as Partial<BlogFrontMatter>;
  if (!fm.title || !fm.description || !fm.date) {
    throw new Error(`Missing required front matter fields in post: ${slug}`);
  }
}

function parsePost(slug: string) {
  const filePath = path.join(blogDirectory, `${slug}.md`);
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);
  assertFrontMatter(slug, data);

  const minutes = Math.max(1, Math.round(readingTime(content).minutes));

  const meta: BlogPostMeta = {
    slug,
    title: data.title,
    description: data.description,
    date: data.date,
    tags: data.tags ?? [],
    published: data.published ?? true,
    readingMinutes: minutes,
  };

  return { meta, content };
}

export function getAllPostsMeta() {
  return getBlogFiles()
    .map((fileName) => parsePost(toSlug(fileName)).meta)
    .filter((post) => post.published)
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));
}

export function getPostBySlug(slug: string) {
  const mdPath = path.join(blogDirectory, `${slug}.md`);
  if (!fs.existsSync(mdPath)) {
    return null;
  }

  const parsed = parsePost(slug);
  if (!parsed.meta.published) {
    return null;
  }

  const post: BlogPost = {
    ...parsed.meta,
    content: parsed.content,
  };

  return post;
}

export function formatPostDate(date: string) {
  return dateFormatter.format(new Date(date));
}
