import type { SpeakingPage } from "./speaking";

// Retain the public page until CMS provisioning and activation are approved.
export const speakingSnapshot: SpeakingPage = {
  title: "Speaking opportunities.",
  intro:
    "One of my favorite ways to interact is live, in-person; though many of the best conversations aren't recorded.",
  talks: [
    {
      href: "https://www.youtube.com/watch?v=uqu7D6q1h34",
      title:
        "Asynchronous frontends: Building seamless event-driven experiences (API305)",
      description:
        "User interfaces by nature are event-driven—interactions trigger events that drive the application. But, integrations between the frontend and backend are often built synchronously using a request/response pattern. This session explores patterns to enable asynchronous, event-driven integrations with the frontend.",
      event: "AWS re:Invent 2024",
      cta: "Watch video",
      group: "conferences",
    },
    {
      href: "https://www.youtube.com/watch?v=jYbfQ07Z7rM",
      title:
        "Implementing security best practices for serverless applications (SVS324)",
      description:
        "Building with serverless enables organizations to build and deploy applications without managing underlying infrastructure. Serverless strengthens your overall security posture by reducing attack surface and shifting security operations to AWS.",
      event: "AWS re:Invent 2024",
      cta: "Watch video",
      group: "conferences",
    },
    {
      href: "https://www.youtube.com/watch?v=HSyE9nS5mMs",
      title: "Patterns for Building Event-driven Web & Mobile App Backends",
      description:
        "User interfaces by their nature are event driven - interactions trigger events that drive the application. But integrations between frontend and backend are often built synchronously using a request/response pattern.",
      event: "GOTO EDA Day 2024 - Warsaw",
      cta: "Watch video",
      group: "conferences",
    },
    {
      href: "https://www.youtube.com/watch?v=okshuSlDSpk&list=PLEx5khR4g7PJO9-CeWVBJ8If1C4jg7brx&index=9",
      title: "Patterns for Building Event-driven Web & Mobile App Backends",
      description:
        "User interfaces by their nature are event driven - interactions trigger events that drive the application. But integrations between frontend and backend are often built synchronously using a request/response pattern.",
      event: "GOTO EDA Day 2024 - London",
      cta: "Watch video",
      group: "conferences",
    },
    {
      href: "https://www.youtube.com/watch?v=U6Zz_Bj6yEY",
      title:
        "Building APIs: Choosing the best API solution & strategy for workloads (SVS301)",
      description:
        "Developers are building large-scale distributed applications that communicate between each other and clients via REST, GraphQL, WebSockets, and other means.",
      event: "AWS re:Invent 2023",
      cta: "Watch video",
      group: "conferences",
    },
    {
      href: "https://www.youtube.com/watch?v=A8iHQjHv8nY",
      title: "Architecting secure serverless applications (SVS302)",
      description:
        "This session explores how to think about security from the front to the back of a typical serverless application.",
      event: "AWS re:Invent 2022",
      cta: "Watch video",
      group: "conferences",
    },
    {
      href: "https://www.youtube.com/watch?v=YTeug7JjMoc",
      title: "Seamlessly connect Stripe events to your frontend",
      description:
        "Josh Kahn, Solution Architect at Stripe, demonstrates how to build event-driven architectures that connect payment processing to real-time user interfaces.",
      event: "Stripe Developer Meet Up - Chicago, October 2025",
      cta: "Watch video",
      group: "meetups",
    },
    {
      href: "https://www.youtube.com/watch?v=G2SmRkHcKE4",
      title:
        "Why embedded finance is transforming modern businesses with Stripe Connect",
      description:
        "Stripe Solution Architect Josh Kahn explains how embedded finance is revolutionizing the way businesses integrate financial services.",
      event: "Stripe Tour New York 2025",
      cta: "Watch video",
      group: "webinars",
    },
    {
      href: "https://youtu.be/DIsGgXfp7RI",
      title: "Connecting Stripe events to frontends in realtime",
      description:
        "The frontend is harder than you think. A conversation between Head of Stripe Developer Relations James Beswick and Stripe Solution Architect Josh Kahn.",
      event: "Stripe Developer",
      cta: "Watch video",
      group: "webinars",
    },
    {
      href: "https://www.youtube.com/watch?v=OJD3UMuU8Zk",
      title:
        "Building Modern Apps with AWS: Choosing the Approach that Works for You",
      description:
        "In this companion video to the AWS Modern Apps decision guide, decision guide manager Geof Wheelwright talks to co-author and AWS Serverless Tech Leader Josh Kahn.",
      event: "AWS Modern Apps Decision Guide",
      cta: "Watch video",
      group: "webinars",
    },
    {
      href: "https://www.youtube.com/watch?v=ZplOXryhX4k",
      title: "Handling errors in a serverless world (SVS311)",
      description:
        "Serverless technologies introduced new ways to build highly scalable, resilient applications without managing infrastructure.",
      event: "AWS re:Invent 2020 (virtual)",
      cta: "Watch video",
      group: "webinars",
    },
  ],
};
