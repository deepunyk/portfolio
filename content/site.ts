export const profile = {
  name: "Deepak Nayak",
  role: "Lead Engineer, Backend · ClearFeed",
  location: "Bengaluru, India",
  email: "deepaknayakp@outlook.com",
  linkedin: "https://www.linkedin.com/in/deepak-nayak-in",
  github: [
    { label: "GitHub", url: "https://github.com/deepunyk" },
    {
      label: "GitHub (work)",
      url: "https://github.com/deepaknyk",
      title: "Most of this activity is in private repos",
    },
  ],
  summary:
    "I was the first engineer at ClearFeed. Five years later I lead the backend team there.",
  detail:
    "ClearFeed is a helpdesk that lives inside Slack and Microsoft Teams. I wrote its backend from the first commit: the event pipeline, the ticketing model on top of chat, the sync with other ticketing tools, and lately the AI agents that resolve requests on their own. Most of what I know comes from keeping that system up while it grew.",
};

export const work = [
  {
    title: "An event pipeline that can't lose messages",
    description:
      "Everything in ClearFeed starts as an event from Slack, Teams, or some other tool. The pipeline now takes in more than 10 million a day at 99.99% uptime. Most of the work was in the failure paths: idempotency, retries, and rate limits from APIs that go down or throttle with no warning.",
    posts: [
      "the-sqs-long-poll-that-never-came-back",
      "slack-connect-the-one-event-problem",
    ],
  },
  {
    title: "Two-way sync with other ticketing tools",
    description:
      "Zendesk, Jira, Salesforce, HubSpot, GitHub, Linear, and Freshdesk. Tickets, comments, and status changes move both ways in real time. Each API has its own ideas about IDs, webhooks, and what counts as an update, and those differences cause most of the bugs.",
    posts: ["building-on-top-of-microsoft-teams"],
  },
  {
    title: "AI agents that take real actions",
    description:
      "A framework where customers build support agents out of tools, workflows, and post-action hooks, with RAG over their own docs. It auto-resolves about 40% of incoming tickets and does things like reset an Okta password without a human in the loop.",
    posts: [],
  },
  {
    title: "Growing the team",
    description:
      "I went from the only engineer to leading a backend team of 15. These days coding agents write first drafts, run reviews, and open PRs, and engineers still own the design and the final call on what ships.",
    posts: [
      "rethinking-typescript-checks-for-agentic-development",
      "one-source-of-truth-global-instructions-for-coding-agents",
    ],
  },
];

export const timeline = [
  {
    company: "ClearFeed",
    title: "Lead Engineer, Backend",
    period: "Mar 2024 - Present",
    detail:
      "I lead the backend team, which is 15 engineers now. I still review the hard designs and write code. I also set up how the team works with coding agents.",
  },
  {
    company: "ClearFeed",
    title: "Founding Engineer",
    period: "Aug 2021 - Mar 2024",
    detail:
      "First engineer. I built the backend from scratch: ticketing on top of Slack and Teams conversations (assignments, custom fields, SLAs, triage queues), the event pipeline, and the first sync integrations with Zendesk, Jira, and Salesforce.",
  },
  {
    company: "JaanSay",
    title: "Full-Stack Engineer (Contract)",
    period: "Aug 2020 - Jul 2021",
    detail:
      "One of two engineers on a hyperlocal community app (events, RSVPs, donations, rewards) built with Flutter and Node.js. We did the deploys and the scaling ourselves on a small DigitalOcean budget, since the startup had no funding. It reached 300+ local businesses and 10,000+ users.",
  },
  {
    company: "3D Usher",
    title: "Full-Stack Engineer (Contract)",
    period: "Dec 2020 - Feb 2021",
    detail:
      "Built an instant-quoting engine for 3D manufacturing that read the geometry of an uploaded part (holes, grooves, complex features) with Three.js, where competitors priced only the outer shape. Zetwerk cited it as a key reason for acqui-hiring the company.",
    post: "using-threejs-for-instant-quoting-at-3d-usher",
  },
  {
    company: "Dreamsoft Innovations",
    title: "Software Engineer Intern",
    period: "Apr 2020 - Oct 2020",
    detail:
      "My first production work: the Flutter side of MojiBooks, a children's reading app, wired into a Unity-based story engine so the two runtimes could talk to each other on phones and tablets.",
  },
];

export const education = {
  school: "Visvesvaraya Technological University (VTU)",
  degree: "B.E. in Computer Science",
  period: "2017 - 2021",
};
