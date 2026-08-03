---
title: "Building on Top of Microsoft Teams: Bot Events, Graph APIs, and the Mental Model That Helped"
description: "What helped while building a Teams integration for a real product, without pretending it is just one API and one happy path."
date: "2026-03-31"
tags: ["microsoft-teams", "bot-framework", "microsoft-graph", "integrations"]
published: true
---

The first instinct with Microsoft Teams is that the job is simple: connect the app, receive messages, send messages back.

What actually helped was splitting that into three separate concerns: the bot side tells you something happened, Microsoft Graph gives you a richer view of the underlying data, and sending messages back is its own path with its own rules. I kept looking for one API that covered all of it, and the integration made a lot more sense once I stopped.

## Bot Framework vs. Graph

If you're building a Teams app, the more useful question isn't "Bot Framework or Graph," it's what each one is actually good at. The split that worked for me:

- Bot Framework for incoming events and bot-authored replies
- Microsoft Graph for reading teams, channels, users, messages, replies, and files

For a first version, I'd build it roughly in this order:

1. get tenant auth and permissions working
2. receive a message event reliably
3. normalize that event into your own internal message shape
4. fetch richer context only when the raw event isn't enough
5. send a reply back into the same conversation
6. add edits, deletes, and attachment handling once the happy path works

The main thing to avoid is letting raw Teams payloads leak across the rest of the app.

## What Gets Tricky Fast

The demo path is easy. The real work shows up around threads, attachments, edits and deletes, and install or membership changes.

Treating inbound bot events as triggers rather than as the source of truth turned out to be the most useful lesson here. They tell you something changed; your app usually still needs a cleaner representation before running product logic on top of it. That's where Graph earns its place: it's a more product-friendly way to read workspace state than staying in webhook mode for everything.

## Attachments

Attachments are the part I'd plan for earlier than most people do. Not every Teams attachment behaves the same way — a useful first split is files that come through the Bot Framework media path versus files that live in Teams or SharePoint and need Graph to resolve them. So the first move is normalizing, before anything gets downloaded.

### Normalizing Attachments

In the raw event flow, the attachment list isn't ready to use as-is. Regular channel files usually arrive as references with a `contentUrl`. Inline images and some mobile-app images are trickier, and I found it useful to normalize those into the same shape as the regular file references before doing anything else — that kept the rest of the pipeline from caring where an attachment originally came from.

The normalized shape stays small:

- `id`
- `url`
- `name`
- `size`
- `mimetype`

Once that exists, the rest of the app can treat attachments consistently.

Here's the normalization step that helped:

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

That shape came from a real constraint: I often wanted file size and content type before actually downloading the bytes.

### Metadata

For Bot Framework media URLs, I used the bot token and made a streamed request just to read the headers, which gave me `content-length` and `content-type` without buffering the whole file. For Graph-backed files, I resolved the `contentUrl` into a DriveItem download URL first and read the headers from there. So the metadata lookup was effectively:

```ts
async function getAttachmentMetadata(contentUrl) {
  if (contentUrl.startsWith("https://smba.trafficmanager.net/")) {
    return getMetadataViaBotToken(contentUrl);
  }

  const downloadUrl = await resolveGraphDownloadUrl(contentUrl);
  return readHeaders(downloadUrl);
}
```

Resolving the Graph side takes an extra hop. The `contentUrl` itself usually isn't something you can download directly — you turn it into a Graph share reference, ask Graph for the DriveItem behind it, and use the returned `@microsoft.graph.downloadUrl`. That's a lot more specific than "download the attachment," but the specificity is what stopped Teams integrations from feeling random.

### Downloading

Once metadata is normalized, the full download path is straightforward: Bot Framework media URLs download with bot auth, Graph or SharePoint-backed files resolve through Graph and then GET the bytes.

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

I also gave the temp file a generated name so collisions wouldn't overwrite earlier downloads in the same batch.

### Inline Images

One detail worth not skipping: Teams message bodies can contain Graph image URLs inline. If you keep those raw URLs in the stored message text and also store the attachments separately, you end up double-counting the same image — search gets noisy, summarization gets noisy, and debugging the stored message gets harder than it needs to be. Cleaning the body text after the attachment list was already normalized avoided that.

### Uploads

Uploading got clearer once I stopped expecting a single "send attachment" API. The pattern that worked: ask Graph for the channel's `filesFolder`, upload the bytes into that folder's drive, keep the returned file `id` and `webUrl`, then send the bot-authored message pointing at the uploaded file.

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

The random prefix matters more than it sounds — write directly to the folder with the original file name and duplicate names can overwrite each other. For outbound messages, Graph owns file storage and the bot owns the conversation message; keeping those as two separate actions instead of one made the responsibility split easier to reason about.

## The Overall Shape

Stepping back from the specifics, and without getting into anything company-specific, this is roughly it.

**Inbound**

1. receive the event
2. identify whether it's message, edit, delete, install, or membership-related
3. fetch richer context if needed
4. normalize it into your own model
5. run your product logic

**Outbound**

1. decide whether you're sending text, a card, or a file-backed message
2. upload files first if needed
3. send the visible bot message
4. store enough identity to support later edits or deletes

**Error handling to plan for from the start:**

- duplicate events
- retries
- partial attachment failures
- edit and delete events arriving later
- tenant permissions that look correct but aren't fully usable yet

## Testing

If you want to try building this yourself, the easiest setup is a Microsoft 365 developer sandbox, or another disposable test tenant. Then test in this order:

1. connect the tenant and verify permissions
2. install the bot into a team
3. send a root message and a threaded reply
4. edit and delete both
5. test screenshots, inline images, and file uploads
6. add or remove users and make sure your assumptions still hold

Steps 4 and 5 are where the demo path stops covering you.
