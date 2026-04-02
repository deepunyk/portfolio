---
title: "Building on Top of Microsoft Teams: Bot Events, Graph APIs, and the Mental Model That Helped"
description: "What helped while building a Teams integration for a real product, without pretending it is just one API and one happy path."
date: "2026-03-31"
tags: ["microsoft-teams", "bot-framework", "microsoft-graph", "integrations"]
published: true
---

The first instinct with Microsoft Teams is usually that the job is simple: connect the app, receive messages, send messages back.

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

The most useful practical lesson was to treat inbound bot events as triggers, not as the whole source of truth. They tell you that something changed. Your app usually still needs a cleaner representation before running product logic on top of it.

That is where Graph becomes useful. It gives you a more product-friendly way to think about workspace state instead of keeping everything in webhook mode.

## Attachments

Attachments are the part I would plan for earlier than most people do.

The main thing is that not every Teams attachment behaves the same way. A useful first split is:

- files that come through the Bot Framework media path
- files that live in the Teams or SharePoint file system and need Graph to resolve them

That means the first step should be normalization, not download.

### What Needed To Be Normalized First

In the raw event flow, the attachment list is not always ready to use as-is.

Regular channel files usually arrive as references with a `contentUrl`.

Inline images and some mobile-app images are trickier. I found it useful to normalize those into the same attachment shape as the regular file references before doing anything else. That kept the rest of the pipeline from caring where the attachment originally came from.

The normalized shape can stay very small:

- `id`
- `url`
- `name`
- `size`
- `mimetype`

Once that shape exists, the rest of the app can treat attachments consistently.

Here is the kind of normalization step that helped:

```ts
async function normalizeTeamsAttachments(message, services) {
  const { graphClient, botClient } = services;

  const supportedAttachments = (message.attachments ?? []).filter((attachment) => {
    const isFileReference = attachment.contentType === "reference";
    const isBotImage =
      attachment.contentType === "image/*" &&
      attachment.contentUrl?.startsWith("https://smba.trafficmanager.net/");

    return isFileReference || isBotImage;
  });

  return Promise.all(
    supportedAttachments.map(async (attachment) => {
      const metadata = attachment.contentUrl.startsWith("https://smba.trafficmanager.net/")
        ? await botClient.getAttachmentMetadata(attachment.contentUrl)
        : await graphClient.getAttachmentMetadata(attachment.contentUrl);

      return {
        id: attachment.id,
        url: attachment.contentUrl,
        name: attachment.name,
        size: metadata.size,
        mimetype: metadata.mimetype,
      };
    })
  );
}
```

That code shape came from a real constraint: I often wanted file size and content type before I actually downloaded the bytes.

### Metadata Is A Separate Step

This is the part that made the flow much clearer.

For Bot Framework media URLs, I used the bot token and made a streamed request just to read the headers. That gave me `content-length` and `content-type` without buffering the whole file.

For Graph-backed files, I first resolved the `contentUrl` into a DriveItem download URL and then read the headers from there.

So the metadata lookup was effectively:

```ts
async function getAttachmentMetadata(contentUrl) {
  if (contentUrl.startsWith("https://smba.trafficmanager.net/")) {
    return getMetadataViaBotToken(contentUrl);
  }

  const downloadUrl = await resolveGraphDownloadUrl(contentUrl);
  return readHeaders(downloadUrl);
}
```

The Graph resolution step is the awkward part. The `contentUrl` itself is not always the thing you want to download directly. The useful pattern is:

- turn the `contentUrl` into a Graph share reference
- ask Graph for the DriveItem behind it
- use the returned `@microsoft.graph.downloadUrl`

That is a lot more specific than "download the attachment," but that specificity is what makes Teams integrations stop feeling random.

### Full Download Still Splits In Two

Once metadata is normalized, the full download path becomes straightforward:

- Bot Framework media URL: download with bot auth
- Graph or SharePoint-backed file: resolve through Graph, then GET the bytes

That left me with a simple download function:

```ts
async function downloadAttachmentFile(attachment, services) {
  const { graphClient, botClient } = services;

  const fileBuffer = attachment.url.startsWith("https://smba.trafficmanager.net/")
    ? await botClient.downloadAttachment(attachment.url)
    : await graphClient.downloadAttachment(attachment.url);

  return writeTempFile({
    originalName: attachment.name,
    bytes: fileBuffer.content,
    mimetype: fileBuffer.mimetype,
  });
}
```

In practice I also gave the temp file a generated name so collisions would not overwrite earlier downloads in the same batch.

### Inline Images Pollute The Body Text

One detail I would not skip: Teams message bodies can contain Graph image URLs inline.

If you keep those raw URLs in the stored message text and also store the attachments separately, you end up double-counting the same image. Search gets noisy, summarization gets noisy, and debugging the stored message becomes harder than it should be.

So I found it worth cleaning the body text after the attachment list had already been normalized.

### Uploads Go Through The Channel File Folder

Uploading was clearer once I stopped expecting a single "send attachment" API.

The reliable shape was:

1. ask Graph for the channel's `filesFolder`
2. upload the bytes into that folder's drive
3. keep the returned file `id` and `webUrl`
4. send the bot-authored message that points to the uploaded file

That is roughly:

```ts
async function uploadFileToChannel(payload) {
  const { graphClient, teamId, channelId, file } = payload;

  const channelFolder = await graphClient.getChannelFilesFolder({ teamId, channelId });
  const uploadedFile = await graphClient.putFileContent({
    driveId: channelFolder.parentReference.driveId,
    folderName: channelFolder.name,
    fileName: withRandomPrefix(file.name),
    bytes: file.bytes,
  });

  return {
    id: uploadedFile.id,
    webUrl: uploadedFile.webUrl,
  };
}
```

The random prefix matters more than it sounds. If you write directly to the folder with the original file name, duplicate names can overwrite each other.

For outbound messages, it helps to treat file upload and visible message send as two different actions:

- Graph owns file storage
- the bot owns the conversation message

That keeps the responsibility boundary clean.

## A Good High-Level Coding Shape

Without getting into company-specific implementation, the coding shape looks like this:

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

Then test in this order:

1. connect the tenant and verify permissions
2. install the bot into a team
3. send a root message and a threaded reply
4. edit and delete both
5. test screenshots, inline images, and file uploads
6. add or remove users and make sure your assumptions still hold

The main takeaway from building on top of Teams is that the platform becomes much less confusing once you stop expecting one surface to do everything.
