---
title: "Making CloudWatch Logs Actually Queryable"
description: "We had logs in CloudWatch, but not in a form CloudWatch could really use. This is the pattern that split local and production formatting, preserved structure, and made Sentry point back to the right logs."
date: "2025-04-28"
tags: ["cloudwatch", "logging", "aws", "observability"]
published: true
---

One of the more annoying observability problems is when you technically have logs but can't really ask them questions. That was the state of our CloudWatch logs for a while.

We were logging plenty of useful data from the app, but by the time it reached CloudWatch, a lot of that structure had collapsed into a hard-to-read string, sometimes with terminal color codes still baked in. CloudWatch wasn't in a position to treat any of it as a structured event. This change wasn't about adding more logs. It was about making the logs we already had behave like data again.

## The formatter was serving too many masters

The underlying logger calls already carried useful context: user IDs, account data, request context, error information. The problem was the formatter, which tried to serve local development, console readability, and CloudWatch ingestion all with the same output shape.

Local terminals and CloudWatch want different things. In a terminal, color helps, short timestamps help, pretty-printed objects help. In CloudWatch, none of that matters if the event stops being valid, machine-parseable JSON. Winston's color codes are a good example: useful in your terminal, pure noise once that formatted string lands in CloudWatch as an escaped string instead of a structured event you can filter and group on.

## Splitting human output from machine output

The first step was pulling the formatting config into shared logger utilities and giving local and production different behavior. In development, the logger uses a custom formatter with color, a short time value, pretty object inspection, and a visual separator between entries. In production, it emits plain JSON with a timestamp, so CloudWatch gets a clean structured object.

Before this, the formatter treated every destination like a console. After, CloudWatch gets treated like the machine consumer it is, and the terminal like the human consumer it is. That also let us delete the duplicated logger setup scattered across modules, since every service was carrying its own slightly different formatting config and its own opinion of what a log event should look like.

## Preserving structure mattered more than formatting

Formatting alone wouldn't have fixed anything, because the real problem was in the logger service itself: metadata needed to survive as metadata instead of getting flattened into an opaque sentence.

The logger now separates three kinds of information: the main message, execution context like request or actor information, and additional metadata passed through logger arguments. Execution context gets grouped into a context object, and metadata that's already an object gets merged into the log record instead of buried inside a string.

A call like this:

```ts
logger.log({ userId: 123 }, { account: { name: "test" } });
```

lets CloudWatch treat `userId` and `account` as fields rather than fragments inside one big message blob, which makes queries like this practical:

```sql
fields @timestamp, @message, account
| filter userId = 123 and account.name = "test"
```

Once the event is proper JSON, logged properties start feeling like columns in a database table instead of substrings you're hoping are unique. That's the difference between "search this string and hope" and actually filtering by user, grouping related events, or running counts across services without cleaning the data up by hand first.

## Error objects needed their own normalization

Not every error object is shaped in a way that's useful to log directly. Sequelize database and validation errors got turned into something closer to a real, readable stack. Axios errors get converted into JSON while dropping noisy or sensitive config fields like request headers and body data. Anything with a stack gets logged using that stack instead of whatever partial stringification would have happened by default.

Structured logging isn't only about adding fields. It's also about deciding what the message should actually be when a complex error object shows up — get that wrong and you technically keep the error, but lose the part that would have helped you debug quickly.

## Giving Sentry and CloudWatch a shared handle

The part I liked most here was linking Sentry and CloudWatch directly. When an error goes to Sentry now, the logger generates a `sentryAlertId` and includes the request context alongside the captured event. That same identifier lands in the log record too, so a Sentry alert can be traced back to its matching CloudWatch logs with:

```sql
fields @timestamp, @message, @logStream
| filter sentryAlertId = "<sentry-alert-id>"
```

Sentry is good at telling you something went wrong. CloudWatch is usually better for seeing what happened around that failure. Without a stable key between the two, you end up doing manual detective work at exactly the moment you want the tooling to help you.

## The service name mattered too

In production, two separate responsibilities were running: one service handled API requests, another processed queued events. Outside production a single service could handle both roles, so the distinction didn't matter much there. In production it did.

This change makes Sentry's `server_name` reflect the actual service that was handling the work, so an issue traces back to the side of the backend that actually owned the failure rather than just "the backend." When request-handling and queue-handling are genuinely separate paths, that boundary needs to show up in the tooling, or debugging stays more abstract than it needs to be.

## What it added up to

None of this was dramatic. Local logs got easier to scan without dragging terminal formatting into CloudWatch, CloudWatch started receiving real JSON instead of messy strings, logged properties became queryable fields, and Sentry alerts could be tied back to the surrounding logs. A logging call isn't done when the line gets printed — it's done when the destination system can actually use the data.

If I were setting this up again, the one thing I'd keep non-negotiable from day one is never sharing a formatter between a human terminal and a machine-ingested destination. Everything else here followed from getting that split right and then verifying it by actually writing CloudWatch Insights queries against the real output, not just eyeballing the console.
