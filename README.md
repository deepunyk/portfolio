# Portfolio Site

Minimal, interview-focused portfolio built with Next.js App Router and file-based blog posts.

## Stack

- Next.js 16 + TypeScript
- Tailwind CSS v4
- Markdown blog posts with `gray-matter`, `react-markdown`, `remark-gfm`

## Run Locally

```bash
npm install
npm run dev
```

App runs at `http://localhost:3000`.

## Content Model

- Profile and homepage content: `content/site.ts`
- Blog posts: `content/blog/*.md`

Each post uses front matter:

```md
---
title: "Post Title"
description: "Short summary"
date: "2026-03-31"
tags: ["backend", "ai"]
published: true
---
```

## Maintenance Flow

1. Update profile and experience in `content/site.ts`.
2. Add a markdown post file in `content/blog`.
3. Run `npm run lint` and `npm run build` before deploying.

## Optional Environment

- `NEXT_PUBLIC_SITE_URL`: canonical site URL used for sitemap generation.
