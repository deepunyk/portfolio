---
title: "Making Production Deployments Easier By Bringing The Flow Into Slack"
description: "How a deployment process with too many AWS-specific paths turned into one Slack-first release flow that people could actually use."
date: "2024-08-22"
tags: ["deployments", "slack", "aws", "automation"]
published: true
---

At one point, deploying production services required too much context to hold in your head.

We were not short on automation. The problem was that each service had its own release shape. One service needed a CDN clearance step. Another needed CodeBuild and CodePipeline to run in sequence. A third needed parameter store values updated before rollout. All of that made sense once you understood the internals, but it made deploys slow to operate day to day.

If you already knew the flow for a service, you could get it done. If you were newer to the team, or just didn't deploy that particular service often, you had to stop and remember which console to open, which buttons to click, and which steps were specific to that one service. I wanted deploying to feel like running a trusted command instead of navigating an internal maze.

Most of the deployment logic had to stay service-aware, because the systems really were different underneath. Forcing every release into one fake universal pipeline would have just made the automation brittle. What was missing was a consistent place to start and a consistent place to finish. Slack was already where the team coordinated releases, asked for help, and watched production changes, so that's where the flow moved.

## The command

The shape stayed simple:

```text
deploy <service-name> <release-version>
```

A real release looks like `deploy app r-99.1.0` or `deploy ui r-80.0.0`. That's the whole surface the team sees. Underneath, those commands are aliases that map to the right AWS Systems Manager automation with the right inputs for that service. The person deploying no longer needs to know the AWS-specific execution path — just the service name and the tag they want in production. Everything past that is the automation's job.

## Why the alias, not one script

`app` mapped to one release path, `ui` to another, and each of the rest pointed at its own document inputs and service-specific handling. The Slack command stayed uniform while the mapping behind it stayed explicit, which let the operator experience be simple without pretending the backend automation was simple too. It puts the complexity where it belongs instead of erasing it.

Approval had to live in the same place. It would have undone most of the benefit to let people kick off a deploy from Slack and then get bounced back to an AWS console to approve it — that split the conversation from the approval, and made the whole thing feel less observable. So once the images are built and the parameter store work is done, the automation posts back into the same Slack channel and asks for approval there. Only a small set of designated approvers can grant it, and they can still go to AWS if they want to, but they don't have to — the approval can happen right from Slack, and the pipeline picks up and finishes the rollout once it's granted.

That last detail mattered more than I expected going in. People used the flow far more cleanly once the whole release, start to finish, stayed in one Slack thread instead of bouncing between chat and console tabs.

## What changed

Some of the deploys were still doing a lot of work underneath — that didn't go away. What changed was how much of it the team had to carry in their heads. Before, deploying something meant knowing its internal release structure. After, you mainly needed the alias and the tag, and the system carried the rest.

Onboarding got easier because new engineers had one operating model to learn instead of N service-specific ones. Releases got easier to trace because the command, the logs, the approval, and the rollout all stayed in the same thread. The awkward or rarely-deployed services stopped depending so heavily on whoever happened to remember how they worked. And the AWS console, which is genuinely useful for debugging, stopped being the default path for something the team needed to do routinely and with confidence.

The Slack command was only the visible layer — the actual work still ran through Systems Manager automation documents with service-specific inputs, which depending on the service meant kicking off a build, updating parameter store values, triggering CodeBuild or CodePipeline, or running whatever extra steps a frontend service needed before traffic saw the new release. It's worth not flattening that into one generic "deployment pipeline" description, because it genuinely wasn't one thing, and that's exactly why putting a single interface in front of it helped rather than papering over anything.

The bigger lesson, if there was one, is that standardizing the entry point and the approval flow gets you most of the benefit of standardization without requiring every backend path to be identical — and that internal tooling improves more when you design it around where the operator already is than around whatever the underlying platform happens to expose.

If I were setting this up again for another team, I'd keep the first version narrow: a small, hard-to-misuse command format, an explicit alias-to-automation mapping instead of one script trying to do everything, approvals and logs returned to wherever the deploy started, and the accepted service names and version format documented right next to the command. The rest can grow later.
