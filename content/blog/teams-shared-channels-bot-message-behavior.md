---
title: "What Shared Channels Actually Change For A Teams Bot"
description: "The confusing part about shared channels in Teams is that your bot setup can be correct, reads can work, and regular message events can still fail unless the bot is explicitly mentioned."
date: "2026-01-19"
tags: ["microsoft-teams", "shared-channels", "microsoft-graph", "bot-framework"]
published: true
---

While working through a Teams bot flow, a behavior showed up that looked like a setup bug at first.

The bot worked fine in standard channels. It could read messages, receive new message activity, and respond normally. Then I tried the same thing in a shared channel. If the bot was explicitly `@mentioned`, I got the event. If someone just posted a regular message in the shared channel, I got nothing.

The app wasn't half-configured. The manifest support was in place, the app had been enabled in the shared channel, and message reads worked fine through Graph. I spent a while looking for a missing permission before realizing there wasn't one to find. The behavior itself was the answer.

## Why it looks like a misconfiguration

Shared channels are close enough to standard channels that you expect the same bot behavior, and that expectation gets stronger the more things are already working: the bot works in a standard channel, the app is installed correctly, the shared-channel manifest support is declared, the bot can read channel messages through Graph, and `@mention`-driven interactions still arrive. With all of that checked off, it's natural to assume you're one setting away from the rest working too.

What's actually going on is a platform boundary, not a missing setting. In the shared-channel case, ambient message ingestion just doesn't behave like it does in standard channels. For shared channels, a bot can be present and still not receive event-style notifications for every message posted there. Standard channels will trigger your ingestion flow on any regular message; shared channels only surface bot-directed interactions like `@mentions`. Being in the channel and being able to observe every message in real time turn out to be two different guarantees. That's easy to miss when you're designing a feature on top of Teams, because installation, presence, and read access don't imply push-style message coverage.

## Setup still matters, it just isn't the fix

A few things are still worth verifying for shared channels, mostly so you don't end up debugging two problems at once: the app manifest should declare `supportsChannelFeatures: tier1`, the app needs to be installed in the parent team, and it needs to be added or enabled inside the shared channel itself. Get those right and you still won't get bot events for regular messages. If you've done all three and plain messages still don't produce events, that's not a broken setup, it's the design.

## Treating it as a polling problem

Once I stopped waiting for a missing event subscription to start working, the design got simpler: `@mentions` are the real-time interaction surface, Graph reads are the state-reading surface, and shared channels need a pull-based ingestion loop if you want broader visibility. Instead of trying to force one webhook path to cover everything, I built shared-channel support around polling.

The relevant endpoint is the channel messages delta feed:

`GET /teams/{team-id}/channels/{channel-id}/messages/delta`

The first call isn't "give me new things," it's a sync. You get existing root messages in pages, you keep following `@odata.nextLink`, and only after paging through the whole initial result do you get an `@odata.deltaLink`. That delta link is the real checkpoint — future calls against it return only changes since the last one. So the pattern is: do the initial sync fully, persist the `deltaLink`, poll it on a schedule (I used 60 seconds), and treat whatever comes back as a change signal rather than a complete snapshot of the thread.

## Delta only tells you about root messages

From testing, the delta API returns root channel messages. Replies don't come back inline as part of one incremental thread payload. Instead, if a reply gets added to a thread, the parent message can show up again in delta. Same thing if something in the thread is edited or deleted — the parent reappears, and the response doesn't always say what actually changed. The parent message becomes a signal that the thread may have changed, nothing more. To get the actual replies you still have to fetch them separately:

`GET /teams/{team-id}/channels/{channel-id}/messages/{message-id}/replies`

Which means the real ingestion loop is: poll delta for changed root messages, treat each one as "go re-read this thread," fetch replies separately, and diff against what you already have stored. There's no single API shape that hands you all channel messages plus full threaded replies plus exact change type in one pass.

## Edits and deletes need their own handling

This is the part that affects your data model, and it showed up early in testing. When an old message is edited, the parent can reappear in delta. When a reply is edited or deleted, the parent can reappear too. When the parent message itself is deleted, you still get the message id back, but the content fields stop being useful the same way. A delta item doesn't tell you the full story of what happened — it's a signal to reconcile state, not an audit log. So you end up keeping your own record of which root messages you know about, which replies belong to which root, what changed between your stored version and the latest fetch, and how you represent deleted content internally. Skip that layer and push raw delta responses straight into product logic, and shared-channel support gets brittle fast.

## What I'd build for this

For a shared-channel setup that needs to feel close to real-time, the pieces are: bot events for direct interactions like mentions, a scheduled delta poller for shared-channel message discovery, a persisted delta checkpoint per channel, a re-fetch of replies whenever a root message shows up in delta, and your own diffing logic for edits and deletes. It's not as clean as a real push stream, but it's predictable, and in integration work predictable tends to win.

Testing this is worth doing as its own pass rather than assuming the standard-channel path covers it: post a new root message in a standard channel and confirm the bot gets it, then do the same in a shared channel and confirm only `@mentions` reach the bot. Run the delta sync to completion and store the `deltaLink`. Add a reply to an old thread and check that the parent reappears in delta. Edit a root message and a reply and check your reconciliation logic catches both. Delete a root message and make sure your internal model can represent that cleanly.

None of this means Teams is inconsistent for no reason. It means shared channels are a different integration surface than standard channels, and once you stop expecting them to behave the same way, the rest of the design falls into place.
