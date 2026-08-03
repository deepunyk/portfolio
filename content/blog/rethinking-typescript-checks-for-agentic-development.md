---
title: "Rethinking TypeScript Checks for Agentic Development"
description: "What changed when agents started writing most of the code, and why that made an always-on TypeScript checker a poor use of local memory."
date: "2026-07-20"
tags: ["typescript", "agentic-development", "developer-tools", "memory"]
published: true
---

I started looking at TypeScript checking because people were complaining about memory.

Our local development setup was using several gigabytes before anyone had done much work. RAM is expensive enough that buying more of it was not the answer I wanted to reach for first. I wanted the normal workflow to fit comfortably on a 16 GB machine, with 32 GB as the upper limit.

The process tree explained where a lot of the memory was going. Each development service started a separate TypeScript checker. One checker held roughly 3 GB. Run a couple of services together and the checkers alone could take more than 6 GB.

That would have been easier to accept if the checkers were gating anything. They were not. The development watcher transpiled the code, restarted the service, and let us continue working. The checker ran asynchronously and printed errors when it found them. A bad type did not stop the application from starting, and a clean server did not prove that the whole codebase passed TypeScript.

The memory cost was real. The guarantee was weaker than I had assumed.

## When the code was written by hand

When I was writing most of the code myself, inline type checking was useful in a very direct way. I would change a function, save the file, and see the compiler complain next to the code. That feedback was part of the editing loop. It helped me catch a wrong argument or an incomplete refactor before I moved on.

Keeping a checker running made sense in that workflow. The developer was producing the code one edit at a time, so the compiler watched the edits one edit at a time.

Our workflow has changed. Agents now write a large part of the code. The unit of work is often a request that produces a group of related edits, not a person typing each line in sequence. Once the agent has finished, it can run a complete type check over the result. That is a better point to spend the memory than keeping a heavyweight checker alive while the server waits for the next change.

This does not make TypeScript less useful. It changes when the useful feedback arrives.

## Moving the check

We made the default watcher responsible for starting the application and rebuilding it. Type checking moved to an explicit verification step:

```text
yarn check-types
yarn test:local
```

The same type check now runs in CI for relevant changes. That turned it into a real gate instead of a background process that happened to report errors.

There was one detail worth checking before trusting the new workflow. The watcher uses a transpiler that removes TypeScript syntax without type-checking it. Tests also do not necessarily load every file in the repository. So a green development server and a green test run together still did not mean that every source file had passed the type system.

I verified that assumption with a deliberately invalid type. The lightweight watcher started normally. The explicit type-check command failed with the expected compiler error. The opt-in watcher mode also reported it inline for the cases where someone is writing a large type-heavy change by hand.

## What changed locally

With the background checkers enabled, the two main development processes used about 8 GB of memory. Without them, they used under 2 GB.

That is a meaningful difference on a 16 GB machine. It leaves room for an editor, a browser, a database, and the other things that tend to be open during development.

The workflow is also easier to explain now:

- the watcher keeps the application running;
- the agent or developer runs the type check after a change is ready;
- tests provide a separate signal;
- CI checks the result before it is merged.

Inline checking is still available. It is just opt-in, because not every development session needs to pay for it.

The interesting part was not removing a tool. It was noticing that the tool had been designed around a manual coding loop, while the coding loop had changed underneath it. In agentic development, the right question is often not whether a check is valuable, but whether it needs to run continuously or reliably at the end of a unit of work.
