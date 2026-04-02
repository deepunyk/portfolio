---
title: "Making Production Deployments Easier By Bringing The Flow Into Slack"
description: "How a deployment process with too many AWS-specific paths turned into one Slack-first release flow that people could actually use."
date: "2024-08-22"
tags: ["deployments", "slack", "aws", "automation"]
published: true
---

At one point, deploying production services required too much context to hold in your head.

The hard part was not that we lacked automation. The hard part was that each service had its own release shape. One service needed a CDN clearance step. Another needed CodeBuild and CodePipeline to run in sequence. Another needed parameter store values updated before rollout. All of that made sense once you understood the internals, but it was still a slow system for humans to operate.

That meant deployments had a high setup cost. If you already knew the flow, you could get it done. If you were newer to the team, or just did not deploy that service often, you had to stop and remember which console to open, which buttons to click, and which steps were specific to that service.

The goal was for the release process to feel more like running a trusted command than navigating an internal maze.

## The Goal Was Not More Automation

The first useful framing was this:

The problem was not only automation coverage. It was the interface.

Most of the deployment logic already needed to stay service-aware because the systems were genuinely different. The point was not to force every release into one fake universal pipeline. The point was to give the team one consistent place to start and one consistent place to finish.

Slack was already where the team coordinated releases, asked for help, and watched production changes. So instead of sending people away from that context into a slower AWS interface, the deployment flow moved into a dedicated deployments channel.

## What The Slack Flow Looks Like

The command shape stayed simple:

```text
deploy <service-name> <release-version>
```

So a release looks like this:

- `deploy app r-99.1.0`
- `deploy ui r-80.0.0`

That is the part the team sees. Underneath, those commands are aliases that map to the right AWS Systems Manager automation with the right inputs for that service.

The important thing is that the person doing the deploy no longer needs to remember the AWS-specific execution path. They just need to know:

1. which service they are releasing
2. which GitHub tag they want in production

Everything else is handled by the automation behind that command.

## Why The Service Alias Mattered

This is the part that made the flow practical.

Our services did not all deploy the same way, and pretending they did would have made the automation brittle. So the Slack command stayed simple, while the mapping behind it remained explicit.

`app` meant one release path.

`ui` meant another.

Other services could each point to their own deployment document inputs and service-specific handling.

That kept two things true at the same time:

- the operator experience stayed uniform
- the backend automation could still respect the messy reality of each service

This pattern works because it does not erase complexity. It puts complexity in the right place.

## Approval Stayed In Slack Too

The other part that mattered was approval.

It was important not to let the command entry point live in Slack and then force the human approval step back into AWS. That breaks the flow again. It also makes the deployment feel less observable because the conversation and the approval split apart.

So after the images are built and the parameter store work is done, the automation posts back into the same Slack channel asking for approval.

Only a small set of designated approvers can grant it.

At that point the approver can still go to AWS if needed, but they do not have to. The approval step can also be completed from Slack itself. Once approved, the pipeline continues and the production rollout finishes from there.

That small detail mattered more than expected. People were much more likely to use the flow cleanly when the whole release stayed in one conversation thread instead of bouncing between chat and console tabs.

## What Actually Got Better

The main improvement was not that deployments became magically simple. Some of them were still doing a lot of work underneath.

What changed was the cognitive load on the team.

Before this, someone deploying needed to know the internal release structure of the service. After this, they mainly needed to know the service alias and the release tag. The system carried the service-specific knowledge.

That helped in a few concrete ways:

- onboarding became easier because new engineers could follow one operating model
- production releases were easier to trace because the command, logs, approval, and final rollout all stayed close together
- rare or awkward service deploys no longer depended so much on tribal memory
- the slow AWS interface stopped being the default path for routine operations

That last point was important. AWS consoles are useful, but they are not a good primary interface for something the team needs to do repeatedly and confidently.

## The AWS Pieces Underneath

The Slack command was only the visible layer. The actual work still happened in AWS.

Internally, the aliases mapped to Systems Manager automation documents with service-specific inputs. Depending on the service, the automation could do things like:

- start the build flow
- update parameter store values
- trigger CodeBuild
- trigger CodePipeline
- run the extra steps a frontend service needed before traffic should see the new release

It is worth not flattening those into one generic "deployment pipeline," because they were not one thing. That difference is exactly why the Slack layer helped. It gave the team a consistent interface without hiding that the backend workflows were different for good reasons.

## What I Learned From Building It

The biggest lesson was that internal tooling gets better when it is designed around the operator's moment of use, not around the underlying platform.

The AWS console exposed the raw machinery. That was useful for debugging, but not ideal for day-to-day release work. Slack was where people already were when they decided to deploy, asked for approval, or watched a rollout. So that was the right surface for the workflow.

The second lesson was that standardization does not always mean making every backend path identical. Sometimes the better move is to standardize the entry point and approval flow while letting the implementation stay specialized.

That is what made this feel reliable instead of over-designed.

## If I Were Setting This Up Again

If another team wanted to build something similar, I would keep the first version disciplined:

1. make the command format extremely small and hard to misuse
2. keep a clear alias-to-automation mapping instead of hiding everything behind one giant script
3. return logs and approval requests to the same channel where the deploy started
4. keep approver permissions explicit
5. document the accepted service names and release version format right next to the command

The best part of this project was that it made production work feel calmer.

Not because production got less serious, but because the path to doing the right thing got shorter. The team could stay in Slack, run a trusted command, wait for the approval prompt, and move the release forward without wrestling the slow interface every time.
