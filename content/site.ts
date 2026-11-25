export const profile = {
  name: "Deepak Nayak",
  location: "Bengaluru, India",
  email: "deepaknayakp@outlook.com",
  links: [
    { label: "LinkedIn", url: "https://www.linkedin.com/in/deepak-nayak-in" },
    { label: "GitHub", url: "https://github.com/deepunyk" },
    {
      label: "GitHub (work)",
      url: "https://github.com/deepaknyk",
      title: "Most of this activity is in private repos",
    },
  ],
};

export type WorkEntry = {
  period: string;
  title: string;
  org: string;
  detail: string;
  post?: string;
};

export const work: WorkEntry[] = [
  {
    period: "2024 – now",
    title: "Lead Engineer, Backend",
    org: "ClearFeed",
    detail:
      "Leading the backend team, which is 15 engineers now. I still write code and review the harder designs.",
  },
  {
    period: "2021 – 2024",
    title: "Founding Engineer",
    org: "ClearFeed",
    detail:
      "First engineer. Built the backend from an empty repo: the event pipeline (now 10M+ events a day at 99.99% uptime), ticketing on top of chat, and two-way sync with Zendesk, Jira, Salesforce, HubSpot, GitHub, Linear, and Freshdesk.",
  },
  {
    period: "2020 – 2021",
    title: "Full-Stack Engineer, contract",
    org: "JaanSay",
    detail:
      "One of two engineers on a hyperlocal community app in Flutter and Node.js, running on a small DigitalOcean budget. It reached 300+ local businesses and 10,000+ users.",
  },
  {
    period: "2020 – 2021",
    title: "Full-Stack Engineer, contract",
    org: "3D Usher",
    detail:
      "An instant-quoting engine that priced 3D parts from their actual geometry, holes and grooves included. Zetwerk cited it as a key reason for acqui-hiring the company.",
    post: "using-threejs-for-instant-quoting-at-3d-usher",
  },
  {
    period: "2020",
    title: "Software Engineer Intern",
    org: "Dreamsoft Innovations",
    detail:
      "Got a Flutter app talking to a Unity story engine for MojiBooks, a children's reading app.",
  },
  {
    period: "2017 – 2021",
    title: "B.E. in Computer Science",
    org: "VTU",
    detail: "Visvesvaraya Technological University, Karnataka.",
  },
];
