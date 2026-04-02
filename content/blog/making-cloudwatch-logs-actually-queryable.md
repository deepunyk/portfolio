---
title: "Making CloudWatch Logs Actually Queryable"
description: "We had logs in CloudWatch, but not in a form CloudWatch could really use. This is how I split local and production formatting, preserved structure, and made Sentry point back to the right logs."
date: "2025-04-28"
tags: ["cloudwatch", "logging", "aws", "observability"]
published: true
---

One of the more annoying observability problems is when you technically have logs, but cannot really ask them questions.

That was the state of our CloudWatch logs for a while.

We were logging plenty of useful data from the app, but by the time it reached CloudWatch, a lot of that structure had collapsed into a hard-to-read string. Some of it still had terminal formatting mixed in. Some of it was just awkward to scan. Most importantly, CloudWatch was not in a good position to treat those logs as structured events.

So this change was not about "adding more logs." It was about making the logs behave like data again.

## The Problem Was Not Missing Data

The underlying logger calls were already carrying useful context.

We had things like user IDs, account data, request context, and error information being passed into the logger. But the formatter was doing too much in one place. It was trying to serve local development, console readability, and CloudWatch ingestion with the same output shape.

That is where things went wrong.

Local terminals and CloudWatch want very different things.

In a terminal, color helps. Short timestamps help. Pretty-printing objects helps. A visible separator between log entries helps.

In CloudWatch, none of that matters if the event stops being valid, machine-friendly JSON.

One especially awkward detail was colorization. Winston's color codes are useful in local output, but once that formatted string lands in CloudWatch, those escape characters are just noise. CloudWatch cannot do anything smart with them. It sees a string, not a structured event you can filter and group.

That meant we had logs, but not queryable logs.

## The Fix Started With Splitting Human Output From Machine Output

The first thing I wanted was a clear separation between local logging and production logging.

So I pulled the formatting config into shared logger utilities and gave the two environments different behavior:

- in development, the logger uses a custom formatter with color, a short time value, pretty object inspection, and a visual separator between entries
- in production, the logger emits plain JSON with a timestamp so CloudWatch receives a clean structured object

That sounds small, but it changes the whole feel of the system.

Before this, the formatter was effectively treating every destination as if it were a console. After this, the logger treats CloudWatch like a machine consumer and the terminal like a human consumer.

That is a much healthier boundary.

It also meant the duplicated logger setup in different modules could go away. Instead of each service carrying its own slightly different formatting config, they now use the same shared utilities. That matters because logging problems get harder to reason about when every service has its own interpretation of what a log event should look like.

## The More Important Change Was Preserving Structure

Formatting alone would not have been enough.

The more important change was in the logger service itself. I wanted metadata to survive as metadata, not get flattened into an opaque sentence.

The logger now does a better job of separating three kinds of information:

- the main message
- execution context such as request or actor information
- additional metadata passed through logger arguments

Execution context is grouped into a context object. Extra metadata that is already an object gets merged into the log record instead of being buried inside a string. That makes the final event much easier for CloudWatch to understand.

This is the part that unlocks actual querying.

If a log call looks like this:

```ts
logger.log({ userId: 123 }, { account: { name: "test" } });
```

CloudWatch can now treat those properties like fields instead of forcing you to grep through one large message blob.

That means queries like this become practical:

```sql
fields @timestamp, @message, account
| filter userId = 123 and account.name = "test"
```

This is the mental model I like here: once the event is proper JSON, the logged properties start feeling more like columns in a database table than fragments inside a console line.

That opens up the normal useful things:

- filtering by a specific user, account, or request
- grouping related events
- checking patterns across services
- doing counts and aggregations without first cleaning up the data by hand

That is a much better observability surface than "search this substring and hope it is unique."

## Error Logging Needed Its Own Cleanup

A second problem was that not all error objects are shaped in ways that are useful to log directly.

This change also improved how error and warning paths normalize common error types before they are written.

For example:

- Sequelize database and validation errors are turned into something closer to the real stack you want to read
- Axios errors are converted into JSON while dropping noisy or sensitive config fields like request headers and request body data
- objects with stacks are logged using that stack instead of whatever partially helpful stringification they would have produced by default

This matters because "structured logging" is not only about adding fields. It is also about deciding what the actual message should be when a complex error object shows up.

If you get that part wrong, you technically keep the error, but you lose the part of it that helps you debug quickly.

## Sentry And CloudWatch Needed A Shared Handle

The part I liked most in this change was linking Sentry and CloudWatch more directly.

When an error is sent to Sentry now, the logger generates a `sentryAlertId` and includes the request context along with the captured event. That same identifier is also present in the log record.

So if a Sentry alert shows up, I can jump to CloudWatch and ask for the matching logs:

```sql
fields @timestamp, @message, @logStream
| filter sentryAlertId = "<sentry-alert-id>"
```

That closes a gap that used to be annoying in practice.

Sentry is good at telling you that something went wrong. CloudWatch is often better for seeing the surrounding logs before and after that failure. If those two systems do not share a stable key, you end up doing manual detective work at exactly the moment you want the system to help you.

Now the handoff is much cleaner.

## The Service Name Turned Out To Matter Too

There was one more piece here that looks minor in code but helps a lot when debugging: service identification.

In production, we have two different responsibilities running:

- `app-server` handles API requests
- `events-handler` processes queued events

Outside production, the app server handles both roles, so the distinction is less important. But in production, it matters a lot.

This change makes Sentry's `server_name` reflect the actual service handling the work. That means an issue can be traced back not just to "the backend," but to the side of the backend that actually owned the failure.

I like this kind of detail because it stops debugging from becoming too abstract. When a system has separate request-handling and queue-handling paths, the service boundary should show up in your tooling.

## What Changed Day To Day

The best logging improvements are usually not dramatic. They just remove friction from the normal debugging loop.

After this work:

- local logs became easier to scan without carrying that terminal-first formatting into CloudWatch
- CloudWatch started receiving real JSON events instead of messy string output
- logged properties became queryable fields
- Sentry alerts could be tied back to CloudWatch with a shared identifier
- the service name in Sentry became more honest about where the error came from

None of that is glamorous, but it is the kind of cleanup that pays back every time something breaks in production.

It also reinforced a simple lesson I keep coming back to: a logging call is not done when the line is printed. It is only done when the destination system can still use that data properly.

## If I Were Setting This Up From Scratch

If I had to build this logging shape again, I would keep a few rules explicit from day one:

1. never use the exact same formatter for local terminals and machine-ingested production logs
2. keep log metadata as structured fields instead of packing it into a string message
3. include service identity and request context early, before you need them during an incident
4. make error paths normalize complex objects so stacks and key fields survive cleanly
5. verify the result in the real destination by writing actual CloudWatch Insights queries, not just by looking at console output

That last point is worth stressing.

A logging change is not really proven when the CLI output looks nice. It is proven when CloudWatch parses it the way you expected, Sentry keeps the useful context, and you can answer a real debugging question in a few minutes instead of half an hour.

That was the real improvement here.
