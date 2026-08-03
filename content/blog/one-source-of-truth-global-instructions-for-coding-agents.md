---
title: "One Source of Truth: Global Instructions for Claude, Codex, and Other Coding Agents"
description: "A practical way to share agent guidance across tools without turning one global file into an instruction dump."
date: "2026-05-03"
tags: ["ai-agents", "codex", "claude-code", "developer-tools"]
published: true
---

I have several coding agents installed, and they do not agree on the name of the file they read first.

Codex looks for `AGENTS.md`. Claude Code uses `CLAUDE.md`. A repository may have its own instructions as well, and those need to apply no matter which agent is being used.

The tempting solution is to copy the same instructions into every file. That works for a week. Then one file gets updated, another one does not, and the agents slowly develop different ideas about how the work should be done.

The setup I prefer has one canonical file and small tool-specific entrypoints around it.

## The first file

On my Windows machine, the shared file lives here:

```text
C:\Users\clear\.config\ai-agent\INSTRUCTIONS.md
```

It contains rules that apply across repositories:

- inspect the repository and working tree before editing;
- preserve unrelated changes;
- use PowerShell by default;
- do not expose credentials;
- do not push, deploy, or send messages unless asked;
- read more specific workflow guidance when the task needs it.

That file is the source of truth. It is not a Codex file or a Claude file. It is just the shared policy that both tools should follow.

## The pointer files

Codex has a user-level `AGENTS.md` under its configured home directory. Claude Code has a user-level `CLAUDE.md`. The tool-specific files should be small and obvious.

The Codex file can say:

```markdown
<!-- Shared guidance is maintained in C:\Users\clear\.config\ai-agent\INSTRUCTIONS.md. -->

Before starting work, read and follow:

C:\Users\clear\.config\ai-agent\INSTRUCTIONS.md
```

Claude Code supports importing Markdown files with the `@path/to/file` form, so its entrypoint can be:

```markdown
# Shared personal guidance

@C:/Users/clear/.config/ai-agent/INSTRUCTIONS.md
```

The exact syntax is tool-specific. The principle is the same: each agent gets a native entrypoint, and every entrypoint leads to the same content. Codex documents user instructions under `$CODEX_HOME` and aggregates them with repository instructions, while Claude Code loads user and project memory files and supports imports. The [Codex agent loop documentation](https://openai.com/index/unrolling-the-codex-agent-loop/) and [Claude Code memory documentation](https://code.claude.com/docs/en/memory) describe those mechanisms in more detail.

I keep the adapters separate instead of trying to make one file satisfy every parser. A small amount of duplication in the pointer files is cheaper than depending on symlinks, undocumented import behavior, or a filename that only one agent recognizes.

## The second layer

The shared file should not become a manual for every possible task. It should point to smaller documents when they apply.

For example:

```markdown
## Workflow references

When the task matches one of these workflows, read the referenced document first:

- GitHub pull request comments:
  C:\Users\clear\.config\ai-agent\docs\pull-request-comments.md

- AWS or production access:
  C:\Users\clear\.config\ai-agent\docs\aws-access.md

- Starting or debugging the local stack:
  C:\Users\clear\.config\ai-agent\docs\local-stack.md

- Drafting or sending external communication:
  C:\Users\clear\.config\ai-agent\docs\external-communication.md
```

This keeps the baseline instructions short. A task about adding an inline review comment does not need to load local Docker instructions. A read-only production investigation does not need the guide for writing a blog post.

The pointer is also a useful safety boundary. It makes the instruction conditional and explicit: if the task involves production, read the production document before doing anything else.

## What belongs in a workflow document

A workflow document should be more concrete than the global file. It should explain when it applies, what to check, what is allowed, and what evidence to report.

An AWS document might contain rules such as:

```markdown
# AWS production access

Use this document for production AWS investigation.

- Read-only access only.
- Do not modify infrastructure, data, queues, alarms, or deployments.
- Prefer logs, metrics, and query plans.
- Do not run expensive queries.
- Report the account, region, resource, time range, and evidence observed.
```

A pull request document might instead explain how to identify the reviewed commit, how to anchor an inline comment to the changed lines, and how to verify that GitHub accepted the comment.

The global file should point to that process. It should not contain every command and exception from the process.

## Repository instructions still matter

Global instructions are for personal or organization-wide behavior. They do not replace repository instructions.

In this portfolio repository, the root `AGENTS.md` says that content changes should follow `PORTFOLIO_CONTENT.md`. The root `CLAUDE.md` points back to the repository guidance and also retains tool-specific managed content. That is the right division of responsibility:

- global files describe how I work across projects;
- repository files describe this project’s conventions;
- workflow files describe a particular operation;
- the user’s request defines the task for the current session.

More specific project guidance should be allowed to add detail. It should not silently weaken a global safety rule.

## Keep it maintainable

There are a few habits that keep this arrangement from turning into another pile of configuration:

- keep the canonical file in a stable location;
- keep the tool adapters short;
- give each workflow document a clear scope;
- do not put secrets, tokens, or customer data in instruction files;
- remove stale references when paths or tools change;
- test the setup in each agent after changing an import or pointer.

The important part is the boundary between the files. Global instructions answer, “How should this agent work in general?” Workflow documents answer, “What must happen for this particular kind of task?” Repository instructions answer, “What is true about this codebase?”

Once those questions have separate homes, Claude, Codex, and the other agents do not need identical configuration systems. They only need reliable paths to the same decisions.
