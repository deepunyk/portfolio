---
title: "Moving Our Backend From ESLint to oxlint"
description: "Commits went from 18 seconds to about one, and full-repo lint from 94 seconds to under six. The work was in keeping the rules we actually relied on."
date: "2026-11-25"
tags: ["typescript", "linting", "developer-tools", "agentic-development"]
published: true
---

Every commit in our main backend repo took about 18 seconds before git let go of it. Most of that was ESLint.

The pre-commit hook ran ESLint over the whole repository with `eslint-plugin-diff`, which reports only the lines you staged. Reporting less didn't mean doing less work, though. ESLint still had to build a TypeScript program for the whole repo, because one of our rules (`return-await`) needs type information. The hook needed `--max-old-space-size=4096` to avoid running out of memory, and it peaked around 2.5 GB.

The coding agents made it worse. Our Claude and Codex configs had a post-edit hook that ran Prettier and then `npx eslint --fix` on every file an agent touched. ESLint on a single file still built the whole TypeScript program (opening one file cold in the editor took about 22 seconds and 3 GB), and the hook paid that on every edit. It also ended in `|| true`, so when the fix failed nobody saw it. We were paying for lint on every agent edit and getting no guarantee out of it.

Nothing in CI checked lint or formatting either. If someone committed with `--no-verify`, or their hook broke, the violation just went to `main`.

This is the same thing I wrote about in [the TypeScript checks post](/blog/rethinking-typescript-checks-for-agentic-development): a check built around a person saving one file at a time, still running after the work stopped happening that way.

## Why oxlint

oxlint is the linter from the oxc project, written in Rust. It claims to be 50 to 100 times faster than ESLint. The claimed speedup mattered less to me than whether it could run the 33 rules we had configured.

Most of them mapped directly. Three didn't:

- `return-await` needs types. oxlint handles type-aware rules through a separate binary, `oxlint-tsgolint`, which uses the Go port of TypeScript. It's the only type-aware rule we use, so `--type-aware` only pays for that one rule.
- `@typescript-eslint/naming-convention` can't run under oxlint at all, because it depends on typescript-eslint's parser services. I wrote a small JS plugin (oxlint can load those through `jsPlugins`) covering the two conventions we actually enforced: variables in camelCase, PascalCase or UPPER_CASE, and functions in camelCase.
- `eslint-plugin-unused-imports` went away. oxlint's `no-unused-vars` has a fix option that removes unused imports, which was the only reason we had the plugin.

To check parity, I made a seed file with one violation per rule and ran it through ESLint on the base branch and through oxlint on mine. Both produced 39 findings. The only differences were a rule I was dropping on purpose and one declaration-merging case that ESLint reported twice and oxlint once.

The seed file missed something. When I ran an AI review on the PR, it found my naming plugin was looser than the rule it replaced. My UPPER_CASE check didn't validate underscores, so `FOO__BAR` and `__FOO` passed. It also only visited function declarations, so named function expressions and `declare function` went unchecked. The reviewer ran both linters on seven names: ESLint flagged all seven, my plugin flagged two. I fixed it and added a test that lints a fixture and expects exactly the 10 lines the old typescript-eslint rule reported on it. CI runs that test now, so the plugin can't quietly drift again.

The rule I dropped was a ban on a certain style of `dayjs` import. It existed because default-import interop used to break in one of our build paths. I checked by running a default import under SWC, TypeScript 6 and ts-jest, and all three handle it now.

## The numbers

Measured on the same repo before and after. The commit numbers are for a two-file change, the editor numbers are for opening one large service file, and CI is the 2-CPU runner without Node setup.

| Step | ESLint + Prettier | oxlint + oxfmt |
| --- | --- | --- |
| Commit | ~18.5 s, ~2.5 GB | ~1.3 s, ~180 MB |
| Full-repo lint | 94 s, 6.2 GB | 5.7 s, 3 GB |
| Editor: lint on opening a file | ~22 s, ~3 GB | ~33 ms, ~117 MB |
| Editor: lint after an edit | ~3.3 s | ~12–15 ms |
| Editor: format on save | ~170–430 ms | ~5 ms |
| CI | no lint, no format check | lint ~13 s, format ~1 s |

Full-repo lint still uses 3 GB, which surprised me until I looked at what was using it. That's `tsgolint` building the TypeScript program for `return-await`. Without the type-aware rule it would be far smaller, but I didn't want to lose a rule just to make a table look better.

## Where each check runs now

Speed wasn't the only goal. I also moved checks to where they make sense:

- **Commit:** `lint-staged` runs `oxlint --fix` and then oxfmt on staged files only. The old hook ran `git add` on every staged file after fixing, so unstaged edits in those files got pulled into the commit. That no longer happens.
- **Push:** a new hook runs the full type check (about 11 seconds) when the push touches code, and skips it for docs-only pushes.
- **CI:** lint and the format check run on every PR, next to the type check that was already there.

I removed the agent post-edit hooks completely. With a one-second commit hook and a CI gate, there was no reason to lint after every single edit.

Unused imports and unused variables are errors now (a `_` prefix is allowed for variables you mean to ignore). There's one gap I didn't close: unused `import * as X` and `import x = require()` get reported but not removed automatically, so you have to delete those by hand.

## Things that came up during the migration

`no-unused-vars` flagged a handful of imports that were only used inside JSDoc `{@link}` and `@see` tags. TypeScript elides them at compile time, so removing them changes nothing at runtime. But go-to-definition on a JSDoc link only works if the name is imported, and I went through all 19 of these by hand to confirm that. They stayed as `import type` with a disable comment explaining why.

Replacing Prettier with oxfmt reformatted about 207 files in one go. That's an unpleasant diff to review, especially when it touches hot paths. The review compared the ASTs of all 177 changed JS/TS files. Apart from imports, the only differences were `private declare` becoming `declare private`, and a leading `|` dropped from a union type.

The one thing I couldn't fix from the repo had nothing to do with oxlint. Anyone whose user-level VS Code settings made Prettier the default TypeScript formatter kept getting Prettier on save, at 80 columns, fighting oxfmt in the commit hook. The fix was a settings change on each machine, which you can only put in the PR description and hope people read.
