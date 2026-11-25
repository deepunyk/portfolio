---
title: "Scoping an AI Agent's Tools to the Person Asking"
description: "How we let a support agent reset passwords and read HR records from Slack without trusting the model to stay on the right account."
date: "2026-11-25"
tags: ["ai-agents", "llm", "security", "integrations"]
published: false
---

When our AI agents first got Okta tools, an agent could do anything the connected Okta credentials allowed. The admin picked which tools an agent had, and from then on it could look up any user, reset anyone's password, or move people between groups. Whoever was talking to the agent effectively had the admin's reach.

That breaks down once the person talking to the agent is an ordinary employee asking about themselves. For us the first case was BambooHR, not Okta. Someone asks in Slack how much leave they have left. The agent has an HR integration that can read every employee's record, the question is about one person, and nothing in the toolkit knew who that person was.

## What I didn't want to rely on

The easy fix is a line in the system prompt: only act on the user who asked. We do have that line. But the model weighs a prompt against everything else in its context. It doesn't obey it the way code runs, and anyone who has watched a model get talked into something can picture how "my manager asked me to check Priya's balance" goes. I wanted an agent that couldn't act on someone else, not one that had been asked nicely not to.

## Removing the argument

Every tool that acts on a person had a `userId` input. In restricted mode that input is removed from the schema the model sees. The model can still call "reset password", but there is no field where it could say whose.

Our code fills in the user at execution time. It takes the email from the requester's Slack profile (or the ticket requester's email, when an automation runs the agent), lowercases it, looks up the matching user in BambooHR or Okta, and calls the API with that ID. If there's no email, or no matching user, the tool returns an error and no API call is made. The lookup is cached for the agent session, so a conversation with five tool calls does one lookup, and a session never reuses another session's cache.

Some tools can't be scoped this way: listing or searching users, creating a user, changing group membership. Those are dropped from the toolkit in restricted mode. If an admin tries to save a restricted-mode agent with one of them configured, the save fails with an error. The alternative was removing them silently, and then the admin finds out much later that a tool they configured never ran.

<!-- TODO(Deepak): is that the real reason for failing the save instead of filtering silently? -->

The prompt line stayed, but its job changed. Once the schema does the enforcement, the prompt is there so the model refuses clearly and says no action was taken. Without it, "reset Priya's password" would make the model call a tool that has no target field, and the tool would reset the requester's own password instead. Nobody else's account is touched, so it's technically safe, and it would still be a terrible experience.

## Adding Okta

I built this for BambooHR in January and turned it on for Okta two weeks later. The Okta change on our side was small: add it to the list of integrations that support restricted mode, and pass the session cache through. That was possible because identity resolution lives in one handler that wraps every tool, so each integration doesn't do it differently.

So when someone writes in Slack that they're locked out, the agent can unlock them or send them a reset email, and the only Okta account it can reach is the one tied to their Slack email.

## What I'm not happy with yet

All of this depends on the Slack email matching the Okta or BambooHR email. At most companies it does, because both come from the same identity provider. When it doesn't, the lookup fails and the agent says it couldn't find you. That's safe, but it doesn't help the person, and I don't have a good answer yet for contractors or people with email aliases.

There's also no confirmation step. A restricted-mode agent acting on your own account doesn't ask whether you're sure before it acts. For a password reset that's fine, since the reset email is the confirmation. For some of the other self-service actions I'm less comfortable, and that's the next thing to look at.

<!-- TODO(Deepak): a real moment would make this post. Did an agent ever try to act on the wrong person, or did a customer push for this? Anything from rollout? -->
