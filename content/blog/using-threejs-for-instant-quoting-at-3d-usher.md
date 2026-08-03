---
title: "Using Three.js at 3D Usher to Make Instant Quoting Less Wrong"
description: "What it took to build a manufacturing quote flow that looked beyond the outer shape of a 3D model and priced the harder details too."
date: "2021-03-18"
tags: ["threejs", "manufacturing", "3d-models", "pricing"]
published: true
---

At 3D Usher, I worked on instant quoting for manufactured plastic parts. A customer uploads a 3D file, picks a manufacturing process, selects material and quantity, adds shipping details, and gets a price back without the usual back and forth with a sales rep. The pitch sounds simple. Making the number trustworthy was the actual work.

Other instant-quote tools were already out there, and most of them leaned on broad shape or basic dimensions. They didn't look hard at the things that actually drive manufacturing cost: grooves, holes, internal features, geometry that makes tooling harder than it looks from the outside. A model can have a clean, simple silhouette and still be a pain to produce. If your pricing only understands the outer shell, you get a quote that looks confident and is wrong in a way the customer won't discover until later, when a vendor pushes back on the price.

## Three.js as the geometry layer

Three.js ended up doing more than rendering a preview. Users uploaded 3D files, and the app needed to inspect the geometry and pull out signals that mattered for pricing, not just draw the mesh on screen. The viewer itself had value on its own, since a lot of customers didn't want to fire up CAD software just to look at a file, but for the quoting flow it also became step one of the analysis pipeline.

The flow ran roughly like this: upload a model, parse and render it in the browser, inspect it for features that affect manufacturability, collect process/material/quantity/shipping inputs from the user, combine the geometry signals with pricing rules, and return a quote instead of routing the file into a manual review queue. Three.js mattered because it let us work with the model directly rather than treating the upload as an opaque blob to hand off somewhere else.

## The pricing side

The geometry work was only half of it. There was also a large spreadsheet-driven pricing model behind the scenes, capturing how quotes moved across material, quantity, shipping, and process. Geometry fed into that too, but it was the odd one out — everything else came from a dropdown or a form field, while geometry had to be inferred from the actual model.

We kept the two halves separate: a Three.js analysis layer that understood the part, and a quotation layer that turned that understanding into a price. Keeping them apart meant that when a quote looked wrong, you could tell fairly quickly whether the geometry read was off or the pricing rule was off, instead of untangling one big pile of logic every time.

Most of the actual difficulty wasn't in the code. My background was computer science, and this problem lived in a mechanical domain I didn't start out understanding. Before any of the geometry logic was useful, I had to learn why certain shapes are hard to manufacture, why some internal features raise cost more than a glance at the outer dimensions would suggest, and why two parts that look similar from outside can be completely different jobs on the shop floor. That took longer than writing the inspection code itself. Once the mental model was there, the code followed. I stopped thinking of the quote as a formula and started thinking of it as a manufacturing judgment that happened to be encoded in software.

Manual quoting in this industry is slow because files get passed around, vendors review them one at a time, and a customer waits days to find out what something costs. 3D Usher was trying to collapse that into a guided flow a customer could run through in minutes. But speed by itself wouldn't have been worth much — a fast wrong answer is still wrong. If a customer uploads a part with hidden complexity, picks injection molding or vacuum casting or 3D printing, and gets a number back immediately, that number has to reflect more than a thumbnail glance at the shape. That was the actual bar for the project, and it's what made the geometry work worth doing carefully rather than quickly.

I came out of that project with a lot more respect for how much domain knowledge sits behind something that looks, from the outside, like a single button on a web page. I'd started it thinking mostly about rendering and pricing logic. I left it thinking that the rendering and logic were the easy part, and the real work was learning enough about manufacturing to know what the geometry was actually telling me.
