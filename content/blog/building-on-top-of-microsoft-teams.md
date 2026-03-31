---
title: "Building on Top of Microsoft Teams: Bot Events, Graph APIs, and the Mental Model That Helped"
description: "What I learned building a Teams integration for a real product, without pretending it is just one API and one happy path."
date: "2026-03-31"
tags: ["microsoft-teams", "bot-framework", "microsoft-graph", "integrations"]
published: true
---

When I first started building on top of Microsoft Teams, I thought the job was simple: connect the app, receive messages, send messages back.

What actually helped was a different mental model:

- the bot side tells you that something happened
- Microsoft Graph gives you a richer view of Teams data
- sending messages back is its own concern

Once I stopped looking for one perfect API, the integration made a lot more sense.

## The Split That Helped

If you are building a Teams app, the useful question is not "Bot Framework or Graph?" It is "what is each one good at?"

The split I like is:

- Bot Framework for incoming events and bot-authored replies
- Microsoft Graph for reading teams, channels, users, messages, replies, and files

That keeps the model clean.

At a high level, I would build the first version in this order:

1. get tenant auth and permissions working
2. receive a message event reliably
3. normalize that event into your own internal message shape
4. fetch richer context only when the raw event is not enough
5. send a reply back into the same conversation
6. add edits, deletes, and attachment handling after the happy path works

The important part is to avoid letting raw Teams payloads leak across your whole app.

## What Gets Tricky Fast

The Teams demo path is easy. The real work shows up in a few places:

- threads
- attachments
- edits and deletes
- install and membership changes

The biggest practical lesson for me was to treat inbound bot events as triggers, not as the whole source of truth. They tell you that something changed. Your app usually still needs a cleaner representation before running product logic on top of it.

That is where Graph becomes useful. It gives you a more product-friendly way to think about workspace state instead of keeping everything in webhook mode.

## Attachments

Attachments are the part I would plan for earlier than most people do.

The main thing is that not every Teams attachment behaves the same way. At a high level, I would think about them like this:

- bot-hosted or inline attachments
- regular files backed by Teams or SharePoint storage

That means your first step should be classification, not download.

### Where To Get The Attachment From

The rough pattern is:

- if the event gives you a bot-hosted attachment URL, fetch it through the bot-authenticated path
- if the event points to a normal Teams file, use Graph to resolve the file and download it
- if you only need metadata first, fetch metadata before downloading the full content

In practice, the fields you usually want to normalize are:

- file name
- content type
- size
- source URL or file reference

That gives the rest of your app one stable attachment shape.

### Download Pseudocode

```ts
async function downloadAttachment(attachment) {
  if (isBotHostedAttachment(attachment)) {
    return downloadViaBotAuth(attachment.url);
  }

  const fileRef = await resolveViaGraph(attachment.url);
  return downloadViaGraph(fileRef);
}
```

### Upload Pseudocode

For uploads, I would keep it simple:

1. upload the file into the channel's file storage location
2. get back the file URL or reference
3. send a message that includes or points to that file

```ts
async function sendMessageWithFile(channelRef, file, text) {
  const uploadedFile = await uploadFileToChannelStorage(channelRef, file);

  return sendBotMessage(channelRef, {
    text,
    fileUrl: uploadedFile.webUrl
  });
}
```

Inline images need a bit more care. If you store raw image URLs directly in the message body, your downstream search, summarization, and debugging get noisy very quickly.

## A Good High-Level Coding Shape

If I had to explain the coding shape without getting into company-specific implementation, it would be this:

### Inbound

1. receive the event
2. identify whether it is message, edit, delete, install, or membership-related
3. fetch richer context if needed
4. normalize it into your own model
5. run your product logic

### Outbound

1. decide whether you are sending text, a card, or a file-backed message
2. upload files first if needed
3. send the visible bot message
4. store enough identity to support later edits or deletes

### Error Handling

Plan for these from the beginning:

- duplicate events
- retries
- partial attachment failures
- edit and delete events arriving later
- tenant permissions that look correct but are not fully usable yet

## Testing

If you want to try building this yourself, the easiest setup is a Microsoft 365 developer sandbox if you have access to one, or another disposable test tenant.

Then I would test in this order:

1. connect the tenant and verify permissions
2. install the bot into a team
3. send a root message and a threaded reply
4. edit and delete both
5. test screenshots, inline images, and file uploads
6. add or remove users and make sure your assumptions still hold

The main thing I took away from building on top of Teams is that the platform becomes much less confusing once you stop expecting one surface to do everything.
