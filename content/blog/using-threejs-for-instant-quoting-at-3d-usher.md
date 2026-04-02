---
title: "Using Three.js at 3D Usher to Make Instant Quoting Less Wrong"
description: "What it took to build a manufacturing quote flow that looked beyond the outer shape of a 3D model and priced the harder details too."
date: "2021-03-18"
tags: ["threejs", "manufacturing", "3d-models", "pricing"]
published: true
---

At 3D Usher, I worked on a problem that looked simple from the outside: instant quoting for manufactured plastic parts.

The company was building a tool where a customer could upload a 3D file, choose a manufacturing process, select material and quantity, add shipping details, and get a quote without waiting through the usual back and forth. That sounds straightforward until you ask a harder question:

How do you stop an "instant quote" from being instantly wrong?

That was the real project.

## The Problem With Surface-Level Quoting

There were already tools in the market offering instant quotes. The issue was that many of them treated a 3D model too casually. They could look at broad shape or simple dimensions, but they did not really account for the details that make manufacturing expensive:

- grooves
- holes
- curves
- deeper features inside the part
- geometry that changes tooling difficulty

If the system only understands the outside shell, the quote can look fast and polished while still being off in a way that matters. That is a bad product outcome for both sides. The customer gets misleading pricing, and the manufacturer inherits confusion later.

So the goal was not just to generate a number quickly. The goal was to inspect the model closely enough that the number held up.

## Why Three.js Was Part Of The Answer

Three.js ended up being the geometry layer for the quoting flow.

Users would upload 3D files, and the system needed to do more than just display them in a browser. It needed to inspect the model and extract signals that were useful for pricing. A free online viewer was already valuable on its own because many customers did not want to open paid CAD software just to inspect a file. But for quoting, the viewer also became part of the analysis pipeline.

At a high level, the flow looked like this:

1. the user uploaded a 3D model
2. the model was parsed and rendered in the browser
3. the geometry layer inspected features that affected manufacturability
4. the user selected process, material, quantity, and shipping inputs
5. the quotation layer combined geometry-driven signals with pricing rules
6. the system returned a quote immediately instead of pushing everything into manual review

Three.js helped because it made it possible to work directly with the model rather than treating the file as an opaque upload.

## The Other Half Was The Pricing Engine

The 3D side was only half the job.

There was also a large spreadsheet-based pricing model that captured how quotes changed across different parameters. Material changed the number. Quantity changed it. Shipping changed it. Manufacturing process changed it. Geometry changed it too, though that part was harder because it had to be inferred from the model rather than selected from a dropdown.

So the system ended up with two connected layers:

- a Three.js-based analysis layer to understand the part
- a quotation layer to translate that understanding into pricing

That split mattered. If everything lived in one pile of logic, it would have been very hard to reason about why a quote changed. Separating geometry inspection from pricing rules made the system easier to evolve.

## The Hard Part Was Not Just Coding

The most interesting part of the project was that the challenge was not purely technical.

My background was in computer science, but this problem sat deep inside a mechanical domain. Before the code could be useful, the domain work had to be clear: why certain shapes were difficult, why some features increased cost, and why two models with roughly similar outer dimensions could have very different manufacturing implications.

That part took real effort. The manufacturing logic had to be understood before implementation could become useful.

The geometry layer could not be treated as a visual problem only. The hard part was understanding what the geometry meant.

That changed the way I approached the work:

- I spent time understanding how different processes react to part complexity
- I learned why internal features matter more than a quick visual scan suggests
- I stopped thinking of the quote as a formula and started thinking of it as an encoded manufacturing judgment

That was probably the biggest lesson from the whole project. In domain-heavy software, code is often the easy part after the mental model becomes clear.

## What Made The Product Useful

What made this work satisfying was that it connected technical depth to a very practical user problem.

Manual quoting in manufacturing is slow for obvious reasons. Files move around, vendors review them, people compare options, and a customer can lose days just waiting for somebody to inspect a part. 3D Usher wanted to compress that into a much faster flow. Internally, the framing was basically moving from a long quoting cycle to a few guided steps.

But speed alone would not have been enough. The more important part was building trust in the output.

If a customer uploads a model with hidden complexity, chooses injection molding or vacuum casting or 3D printing, and gets a number immediately, that number needs to reflect more than a thumbnail understanding of the part. That is what made the problem worth solving.

The surrounding dashboard and tracking experience mattered too, but the core technical challenge was making the model analysis and quotation logic feel grounded in the real manufacturing workflow.

## What I Took Away From It

This project pushed me into a kind of engineering work I still enjoy: software that sits right at the boundary between code and a messy real-world system.

It taught me a few things that have stayed with me:

- when a product depends on domain judgment, you have to learn the domain instead of abstracting it away too early
- a fast answer is only valuable if the system actually understands what it is looking at
- separating analysis from pricing rules makes complex business logic easier to maintain
- the best technical decisions often come after you understand why operators in the business already do things the hard way

I started that work thinking mostly about rendering and logic. I came out of it with much more respect for how much real-world knowledge sits behind something as small as a quote button.

## If I Were Building This Again

If another engineer were tackling a similar instant-quoting system, I would keep the first version disciplined:

1. start with a small set of real customer models, not ideal demo files
2. validate the geometry signals against someone who actually understands manufacturing
3. keep the model-inspection layer separate from the pricing-rule layer
4. make pricing inputs easy to update because spreadsheets and business rules will change
5. compare system quotes against manual quotes until the gaps are obvious

The main thing I learned at 3D Usher was that instant quoting is not really a UI feature. It is a domain understanding problem wearing a UI feature on top.
