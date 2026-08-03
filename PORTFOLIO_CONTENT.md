# Portfolio Content Guide

This portfolio should read like it was written by a real engineer reflecting on his work, not like a job application, landing page template, or AI-generated personal brand exercise.

## Voice

- Write in first person when the page is about Deepak.
- Keep the tone calm, direct, and human.
- Prefer concrete observations over polished claims.
- Let warmth come through by showing what he enjoys building and how he works with people.

## What To Emphasize

- Love of building from scratch.
- Enjoyment of hard backend and integration problems.
- Care for reliable systems that people depend on.
- Interest in building strong teams, mentoring, and creating trust.
- Real lessons from startup work, not generic ambition.

## Avoid

- Recruiter language like "results-driven", "proven track record", or "seeking opportunities".
- Obvious interview framing like "hire me", "top companies", or "open to roles" as the main message.
- Empty superlatives, inflated claims, and vague "passion" statements.
- Generic AI phrasing or tidy paragraphs that sound over-produced.

## Writing Style

- Use short to medium sentences, but vary them. If every sentence is the same length, it reads like a machine. Let some run long and some be three words.
- Include texture from real work: messy beginnings, tradeoffs, team dynamics, real systems, dead ends that went nowhere.
- If a sentence could apply to any engineer, rewrite it until it feels specific to this portfolio.
- Keep the writing modest. Confidence is fine; sales language is not.

## Technical Blogs

These posts should read like an engineer writing up something they actually lived through, the way Dan Luu, Julia Evans, Brandur Leach, or a good "rachelbythebay" post reads. Not a tutorial, not a LinkedIn think-piece, not a model demonstrating that it understands the concept.

Before writing:

- Ground the post in real code from the referenced repo. Read it first.
- Know the actual story: what broke, what you tried, what you got wrong, how you found out, what you shipped. The narrative is the spine; the concept is what the narrative happens to teach.

Substance:

- Explain system boundaries concretely: where events enter, what gets queued, what gets stored, which service owns each action. If multiple APIs or services are involved, be explicit about the split instead of flattening it into "the integration."
- Include the awkward details that actually taught you something: ID mismatches, retries, auth edges, attachment handling, an assumption that turned out wrong, the dead end you spent two days on.
- Prefer concrete module names, flows, and tradeoffs over stack-name summaries.
- Do not invent scale numbers, customer impact, dates, or implementation details that are not visible in the code or that you do not actually know. If you don't know a number, don't reach for one.
- It is fine, and good, to leave a thread unresolved: something you still don't fully understand, a fix you're not proud of, a question you never answered.

Length:

- Say the thing once and move on. A post is done when the story is told, not when it hits a word count. If you cut a section and nothing is lost, it was padding.
- Do not restate the thesis in the intro, the middle, and the conclusion. State it once, where it lands hardest, usually after the reader has seen the problem.

## Avoid The AI Tells

The failure mode for these posts is that they come out sounding like an LLM: fluent, symmetrical, over-explained, and hollow. Every item below is a real pattern that has shown up in this repo's posts. Actively avoid them.

- **Headings that state a thesis or moral.** Not "The Lease Is What Saves You When A Run Stalls" or "The First Instinct Is A Lock. I Did Not Use One." Use plain, boring headings that just say what the section is about, or use very few headings at all. Let the prose carry the argument.
- **The antithesis reflex.** The construction "It is not X. It is Y." / "That is not a lock. It is a guardrail." / "This was not a bug in the SDK. It was a bug in my mental model." Used once it has force. Used every few paragraphs it is a verbal tic. Cut almost all of them.
- **Rule-of-three triads for rhythm.** "No lock. No leader election. No Redis." / "Processes restart. Deployments happen. Nodes drain." Real writing does not fall into threes on a beat. Break the pattern.
- **A tidy moral at the end of every section.** Lines like "That is the sort of boring behavior infrastructure code needs" or "boring is exactly the goal." Not every section needs a landing. Sometimes a section just ends because the point is made.
- **Sentence fragments dropped on their own line for drama.** "Midnight." / "2 AM." / "That is not what happened." Almost always cut these; write the real sentence.
- **Crutch words.** "boring," "the shape," "the useful move," "the awkward part," "the interesting part," "that is the part worth writing down." These are AI comfort words. If a draft uses "boring" as a theme word more than once, rewrite it.
- **Over-explaining why each decision was correct.** You do not need to justify every choice to the reader as if defending it. State what you did and why in one pass. Trust the reader.
- **Enumerated wrap-up sections.** "What I Learned," "The Main Lesson," "If I Were Building This Again" followed by a numbered list that repeats what the post already said. If the post did its job, the lessons are already in it. At most, a short, plain closing paragraph.
- **Excessive symmetry and balance.** Perfectly parallel bullet lists, matched clause lengths, every paragraph the same size. Real writing is lumpy. Let it be uneven.
- **Closing flourishes.** "That is the kind of coordination I trust more than a lock." / "the system feels much more honest than it did before." End on a concrete detail or a genuinely unresolved thought instead of a self-satisfied aphorism.

## Good Direction

"I like building things from the messy beginning."

"What keeps me in it is the mix of building solid systems and helping teams grow around them."

"We shipped a 20-second watchdog first. It was a band-aid and I knew it, but it stopped the pager going off while I kept digging."

## Bad Direction

"I am a highly motivated engineer with a proven track record of delivering innovative solutions."

"This site is focused on showcasing skills for recruiters and interviewers."

"That is not a locking problem. It is a state-machine problem." (antithesis tic)

"No lock. No leader election. No Redis." (triad on a beat)
