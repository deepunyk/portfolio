---
title: "What Shared Channels Actually Change For A Teams Bot"
description: "The confusing part about shared channels in Teams is that your bot setup can be correct, reads can work, and regular message events can still fail unless the bot is explicitly mentioned."
date: "2026-04-01"
tags: ["microsoft-teams", "shared-channels", "microsoft-graph", "bot-framework"]
published: true
---

While working through a Teams bot flow recently, I ran into a behavior that looked like a setup bug at first.

The bot worked fine in standard channels. It could read messages, receive new message activity, and respond normally.

Then I tried the same thing in a shared channel.

That is where the shape changed:

- if the bot was explicitly `@mentioned`, I got the event
- if someone posted a regular message in the shared channel, I got nothing

The confusing part was that the app was not half-configured. The manifest support was in place. The app had been enabled in the shared channel. Message reads worked. The missing piece was not another checkbox.

The behavior itself was the answer.

## Why This Feels Like A Misconfiguration

Shared channels are close enough to standard channels that you naturally expect the same bot behavior.

That expectation gets stronger when a few things are already working:

1. the bot works in a standard channel
2. the app is installed correctly
3. the shared-channel manifest support is declared
4. the bot can read channel messages through Graph
5. `@mention`-driven interactions still arrive

That combination makes it easy to spend time looking for the missing permission.

What I found instead is that this is an actual platform boundary. In the shared-channel case, ambient message ingestion does not behave like standard channels.

## The Practical Limitation

The important thing to know is this:

For shared channels, a bot can be present and still not receive event-style notifications for every message posted in the channel.

The symptom is very specific:

- standard channels: regular channel messages can trigger your ingestion flow
- shared channels: only bot-directed interactions, like `@mentions`, show up in the way you expect

That means "the bot is in the channel" and "the bot can observe every message in real time" are not the same thing.

I think this is the part that is easiest to miss when you are designing a product feature on top of Teams. Installation, presence, and read access do not automatically imply push-style message coverage.

## The Setup Steps Still Matter

There are still a couple of setup details worth getting right, because without them you can end up debugging two different problems at once.

For shared channels, I would still verify:

1. the app manifest declares support for shared channels with `supportsChannelFeatures: tier1`
2. the app is installed in the parent team
3. the app is then added or enabled inside the shared channel itself

Those steps are necessary.

They just do not change the message-ingestion limitation described above.

So if you have already done those and regular messages still do not produce bot events, I would stop treating it as a broken setup and start treating it as a design constraint.

## What Worked Better As A Mental Model

The cleanest way I found to think about this was:

- `@mentions` are the real-time interaction surface
- Graph reads are the state-reading surface
- shared channels need a pull-based ingestion loop if you want broader visibility

Once I stopped waiting for a missing event subscription to start working, the design got simpler.

Instead of trying to force one webhook path to do everything, I treated shared-channel support as a polling problem.

## The Polling Shape That Makes Sense

The useful API here is the channel messages delta feed:

`GET /teams/{team-id}/channels/{channel-id}/messages/delta`

The shape is a little awkward, but workable.

The first call is not just "give me new things." It starts with a sync:

- you get existing root messages in pages
- you keep following `@odata.nextLink`
- only after paging through the initial result do you finally receive an `@odata.deltaLink`

That delta link is the real checkpoint. Once you have it, future calls return only changes since the last checkpoint.

So the reliable pattern is:

1. do the initial sync fully
2. persist the `deltaLink`
3. poll that saved link on a schedule, like every 60 seconds
4. treat returned messages as change signals, not as a complete thread snapshot

That last point matters.

## The Awkward Detail: Delta Is Not A Full Thread Feed

From testing, the delta API returns root channel messages. Replies do not come back inline as part of one neat incremental thread payload.

What happens instead is more indirect:

- if a reply is added to a thread, the parent message can show up again in delta
- if something in the thread is edited or deleted, the parent can show up again
- the response does not always tell you exactly what changed

So the parent message becomes a signal that the thread may have changed.

If you need the actual replies, you still have to fetch them separately:

`GET /teams/{team-id}/channels/{channel-id}/messages/{message-id}/replies`

That gives you a more honest ingestion model:

1. poll delta for changed root messages
2. treat each changed root message as "re-read this thread"
3. fetch replies separately
4. compare against what you already stored

There is no single incremental API shape here that gives you "all channel messages plus full threaded replies plus exact change type" in one pass.

## Edits And Deletes Need Extra Care

This is the part I would design for early, because it affects your internal data model.

A few edge cases showed up in testing:

- when an old message is edited, the parent can reappear in delta
- when a reply is edited or deleted, the parent can also reappear
- when the parent message itself is deleted, you can still get the message id back, but the content fields are no longer useful in the same way

So your ingestion code should not assume that a delta item tells you the full story of the event.

I would treat delta as a signal to reconcile state, not as an audit log.

That means keeping your own notion of:

- which root messages you know about
- which replies belong to each root message
- what changed between the last stored version and the newest fetched version
- how you represent deleted content internally

If you skip that layer and try to push raw delta responses directly into product logic, shared-channel support gets brittle very quickly.

## What I Would Build If I Needed Near Real-Time

If I needed a production-ready shape for shared channels today, I would keep it simple:

1. use bot events for direct interactions like mentions
2. use a scheduled delta poller for shared-channel message discovery
3. persist the delta checkpoint per channel
4. re-fetch replies whenever a root message shows up in delta
5. run my own diffing logic for edits and deletes

That is not as clean as a real push stream, but it is predictable.

And in integrations work, predictable usually matters more than elegant.

## What I Would Test Before Shipping

If you are implementing this yourself, I would test the shared-channel path separately from the standard-channel path instead of assuming one proves the other.

My checklist would be:

1. post a new root message in a standard channel and confirm the bot gets it
2. post a new root message in a shared channel and confirm whether only `@mentions` reach the bot
3. run the delta sync to completion and store the `deltaLink`
4. add a reply to an old thread and confirm the parent message reappears in delta
5. edit a root message and a reply and confirm your reconciliation logic catches both
6. delete a root message and make sure your internal model can represent the tombstone shape cleanly

The main lesson for me was not that Teams is inconsistent for no reason.

It was that shared channels need to be treated as a different integration surface. If you assume they behave like standard channels, the bot looks broken. If you treat them as a mix of mention-driven events and pull-based thread reconciliation, the behavior becomes much easier to work with.
