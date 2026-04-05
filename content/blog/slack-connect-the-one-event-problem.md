---
title: "Slack Connect And The One Event Problem When Your App Is Installed Twice"
description: "In a Slack Connect channel, installing the same app on both workspaces does not mean you will receive two Events API deliveries. The fix starts with the event envelope, not the business logic."
date: "2023-11-14"
tags: ["slack", "slack-connect", "events-api", "integrations"]
published: true
---

One Slack Connect behavior took longer to understand than it should have.

The setup looked straightforward:

- workspace A had the app installed
- workspace B had the same app installed
- the channel was shared between the two workspaces
- both bot copies were added to that shared channel

The natural assumption was that a new message in that channel would produce two Events API deliveries, one per workspace installation.

That is not what happened.

What showed up in testing was one delivery.

Slack's docs do hint at this, but not in the exact product-shaped way I was looking for. The useful line is in the [Slack Connect guide](https://docs.slack.dev/apis/slack-connect/): Events API handling has "No duplicated event triggering between shared channels." The [Events API docs](https://docs.slack.dev/apis/events-api/) also explain that the outer payload contains only one `authorizations` entry even when the same event is visible to multiple installations, and that you need [`apps.event.authorizations.list`](https://docs.slack.dev/reference/methods/apps.event.authorizations.list/) to get the full set.

That sounds small until your app is built around workspace-scoped processing.

## The Awkward Part

A lot of Slack apps are modeled like this:

1. receive event
2. use the outer `team_id` to load the installation
3. resolve workspace-specific config, users, and tokens
4. run the rest of the app logic in that workspace context

That works fine in ordinary channels.

In a Slack Connect channel where the app exists on both sides, that model starts to leak. You still get one event, but the business meaning may belong to more than one installation of your app.

From testing, the delivery consistently landed for the bot installation that had most recently been added to the shared channel. I have not found a Slack doc that guarantees that behavior, so I would treat it as an observation, not a contract. The important thing is the part Slack does document:

- one event delivery is normal
- the event may be visible to multiple installations
- you need an extra API call to learn the full authorization set

## What The Event Looks Like

For a normal channel message event, Slack documents an envelope like this:

```json
{
  "type": "event_callback",
  "team_id": "T123ABC456",
  "api_app_id": "A123ABC456",
  "event": {
    "type": "message",
    "channel": "C123ABC456",
    "user": "U123ABC456",
    "text": "Live long and prospect.",
    "ts": "1355517523.000005",
    "event_ts": "1355517523.000005",
    "channel_type": "channel"
  },
  "event_context": "EC123ABC456",
  "event_id": "Ev123ABC456",
  "event_time": 1355517523,
  "authorizations": [
    {
      "team_id": "T123ABC456",
      "user_id": "U123ABC456",
      "is_bot": false,
      "is_enterprise_install": false
    }
  ]
}
```

Once Slack Connect is involved, the outer envelope becomes more important than the inner event. The [Events API docs](https://docs.slack.dev/apis/events-api/) include these top-level fields:

- `authorizations`: one installation that can see the event, not the whole list
- `event_context`: the handle you pass to `apps.event.authorizations.list`
- `is_ext_shared_channel`: whether this happened in an externally shared channel
- `context_team_id`: the workspace context Slack used for delivery

That is the first mental shift that helped:

The delivered event is not "the event for one workspace." It is "one delivery of an event that may be visible to more than one installation."

## The Docs Are Slightly Inconsistent

There is one documentation wrinkle worth calling out because it is easy to get confused by it.

The Slack Connect guide still refers to `authorized_users` in a few places. The current Events API envelope uses `authorizations` instead. The underlying idea is the same, but the practical implementation path today is:

1. read the single delivered `authorizations` entry on the event
2. use `event_context`
3. call `apps.event.authorizations.list` for the complete set

So if you see `authorized_users` in older Slack Connect examples, map that mentally to the newer `authorizations` plus follow-up lookup flow.

## The API Calls That Actually Help

There are two API calls that matter here, and they answer two different questions.

### 1. Which app installations can see this event?

Use [`apps.event.authorizations.list`](https://docs.slack.dev/reference/methods/apps.event.authorizations.list/).

```bash
curl -X POST https://slack.com/api/apps.event.authorizations.list \
  -H "Authorization: Bearer xapp-***" \
  -H "Content-Type: application/json" \
  -d '{
    "event_context": "EC123ABC456"
  }'
```

That call requires an app-level token and the `authorizations:read` scope. Slack is explicit about that in the method docs.

The useful response shape looks like this:

```json
{
  "ok": true,
  "authorizations": [
    {
      "enterprise_id": null,
      "team_id": "T_WORKSPACE_A",
      "user_id": "U_INSTALLER_A",
      "is_bot": true
    },
    {
      "enterprise_id": null,
      "team_id": "T_WORKSPACE_B",
      "user_id": "U_INSTALLER_B",
      "is_bot": true
    }
  ]
}
```

This is the answer to "which installations of my app are expected to care about this event?"

### 2. Which workspaces are connected to this channel?

Use [`conversations.info`](https://docs.slack.dev/reference/methods/conversations.info/) with the channel id from the event.

The [conversation object docs](https://docs.slack.dev/reference/objects/conversation-object/) are the useful reference here. For shared channels, Slack includes fields like:

- `is_ext_shared`
- `shared_team_ids`
- `conversation_host_id`

That tells you about the channel topology, which is related but not identical to event visibility. A channel may be shared across multiple workspaces, but your app may only be installed on some of them.

That distinction matters:

- `conversations.info` tells you who is connected to the channel
- `apps.event.authorizations.list` tells you which app installations can see this event

If the goal is correct event fan-out inside your app, the second call is the important one.

## The Processing Shape I Would Use

I would not push this special case down into the core app logic.

The cleaner place to handle it is right at the edge of the event processor:

1. verify the Slack signature
2. persist or dedupe the raw event by `event_id`
3. if `is_ext_shared_channel` is false, process normally
4. if `is_ext_shared_channel` is true and `event_context` is present, call `apps.event.authorizations.list`
5. expand the single delivered event into one internal work item per relevant authorization
6. feed those derived work items into the existing workspace-scoped pipeline

That keeps the special handling local to ingestion.

The rest of the app can continue to believe it is processing one event inside one workspace context, because by the time the event reaches business logic, that context has already been resolved.

## A Concrete Expansion Step

The start of the processor can normalize one Slack delivery into several internal events:

```ts
type SlackEnvelope = {
  event_id: string;
  event_context?: string;
  team_id: string;
  is_ext_shared_channel?: boolean;
  event: {
    type: string;
    channel?: string;
    user?: string;
    ts?: string;
  };
};

async function expandForAuthorizedInstalls(envelope: SlackEnvelope) {
  if (!envelope.is_ext_shared_channel || !envelope.event_context) {
    return [{ workspaceTeamId: envelope.team_id, envelope }];
  }

  const auths = await slackClient.apps.event.authorizations.list({
    event_context: envelope.event_context,
  });

  return auths.authorizations
    .filter((auth) => auth.team_id)
    .map((auth) => ({
      workspaceTeamId: auth.team_id!,
      envelope,
    }));
}
```

Then each expanded work item can load the correct installation record, token set, and workspace-specific settings before handing off to the normal processing path.

That is a better fit than trying to teach every downstream module that one Slack event may imply multiple workspace contexts.

## A Few Practical Details To Get Right

There are a few details here that are easy to miss:

- Dedupe external work items by `(event_id, workspaceTeamId)`, not just `event_id`, because you are intentionally fanning one Slack delivery out into multiple internal tasks.
- Treat the outer `team_id` as the delivery context Slack chose, not as the full set of workspaces that care about the event.
- Use the Conversations API for channel inspection. Slack Connect docs are pretty direct that shared-channel work should use `conversations.*`, not the older channel APIs.
- Expect shared-channel oddities beyond delivery. Slack also documents channel ID changes during sharing, different privacy settings per workspace, and file events that arrive with `"file_access": "check_file_info"` in Slack Connect channels.

That last one is worth remembering because shared-channel support usually grows one awkward edge at a time.

## What I Would Test Before Trusting It

If I were implementing this from scratch, I would test this path very deliberately:

1. install the app on both workspaces
2. add both bot copies to the same Slack Connect channel
3. send a plain message from workspace A and workspace B
4. confirm you still receive only one webhook delivery per message
5. inspect `is_ext_shared_channel`, `event_context`, and the single returned `authorizations` entry
6. call `apps.event.authorizations.list` and confirm both workspace installations are returned
7. run your internal expansion step and verify both workspace-scoped pipelines process the message
8. remove and re-add one bot copy if you want to test which installation Slack chooses for the single external delivery

That last step is where I saw the "most recently added bot gets the event" pattern. Again, I would keep that framed as observed behavior, not as API contract.

## The Main Lesson

The tricky part is not that Slack Connect hides information from you.

The tricky part is that Slack delivers one event while many apps are built as if event delivery and workspace context are the same thing.

In a shared channel, those are separate concerns.

Once I treated the webhook as a delivery envelope, and not yet as a fully contextualized workspace event, the design got much simpler:

- Slack delivery stays singular
- authorization discovery becomes explicit
- the ingestion edge duplicates or normalizes work
- core app logic stays unchanged

That ended up being the cleanest way to support the special case without letting Slack Connect assumptions spread through the rest of the system.
