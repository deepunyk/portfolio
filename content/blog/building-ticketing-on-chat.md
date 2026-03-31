---
title: "Building Ticketing on Top of Chat"
description: "What changes when support workflows start inside Slack and Teams, not email inboxes."
date: "2026-03-15"
tags: ["support", "backend", "integrations"]
published: true
---

Most support systems were designed for email-style workflows. Chat changes the shape of the problem.

Messages are faster, less structured, and often spread across threads, channels, and direct conversations. If you want ticket quality to stay high, you need strong backend primitives.

## Design Principles

1. Treat every message as an event, not just UI state.
2. Build idempotent processors because chat systems retry aggressively.
3. Keep ticket state separate from channel state.
4. Track SLA timestamps at ingestion time, not after enrichment.

## Integration Lessons

- Slack and Teams have different event semantics and retry behavior.
- External systems like Jira and Zendesk can return partial failures.
- Real-time sync requires strict ownership boundaries for source of truth.

## What Helped

We reduced operational noise by pushing all inbound chat updates through a single event pipeline with typed handlers and observability at every transition point.

That gave us a stable foundation for AI classification and workflow automation later, without rewriting the core ticketing layer.
