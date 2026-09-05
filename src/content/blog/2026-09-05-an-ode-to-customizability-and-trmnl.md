---
date: "2026-09-05T05:00:00.000Z"
title: "An ode to customizability and TRMNL"
author: "Josh"
summary: "How we replaced an over-worked kitchen whiteboard with a customizable TRMNL display powered by Apple calendars, Liquid templates, and a little help from GPT."
---

We're a busy family. Two working parents with two busy teenagers.

Years ago, we hung a day-by-day whiteboard in the kitchen so the kids knew what was for dinner each night. The whiteboard also helped organize meal planning and grocery shopping.

And then life got busier. The kids started playing sports and participating in other activities, each with its own schedule. Those activities often conflicted with or impacted our family dinner plans, so we started tracking activities on the whiteboard using codes like "N - VB" and "A - SBG". We also started adding my travel plans and family events.

That small whiteboard went from useful to confusing.

Enter [TRMNL](https://trmnl.com). Several months ago, I saw a [YouTube video from Quinn Nelson at Snazzy Labs](https://www.youtube.com/watch?v=eIcZZX10pa4) about this e-ink device called a TRMNL.

The Amazon Kindle is the e-ink device familiar to most people. It offers long battery life and clear grayscale or black-and-white text on a somewhat papery background. The TRMNL OG is similar in size to a Kindle, but turned on its side (landscape).

But the display itself isn't what makes TRMNL interesting for our family.

What's most amazing is the wide-ranging integrations and customizability of the platform. It took minutes to add our family Apple calendar to TRMNL.

With some help from GPT, I customized the look of the calendar with a private plugin using the same [Liquid](https://shopify.github.io/liquid/) templating engine I used with Ruby on Rails years ago. My plugin simply pulls data from the existing calendar feed (exposed as JSON) and formats it using the `Plugin Merge` data strategy.

```liquid
{% comment %} An overly simple Liquid template {% endcomment %}
{% for event in events %}
  {{ event.title }}
{% endfor %}
```

For the family dinner menu, I created another Apple family calendar named "Dinner Menu" and connected it to a private TRMNL plugin using `Plugin Merge`. A new Liquid template formats the data as I want it.

![Dinner menu plugin](/images/2026-09-05-an-ode-to-customizability-and-trmnl/dinner-menu.png)

My wife also wanted a view for weekday mornings that incorporated the daily schedule, tonight's dinner, and the weather. Easy! Just another plugin that pulls data from the two calendars and the existing Tempest weather feed. But I'm taking too much credit. GPT was able to help assemble and iterate on the templates quickly using [`trmnl-agents-skills`](https://github.com/usetrmnl/trmnl-agent-skills/tree/main).

![Weekday plugin](/images/2026-09-05-an-ode-to-customizability-and-trmnl/weekday.png)

It’s not perfect, of course. E-ink isn’t the right display for rapidly changing information, and getting the calendars formatted exactly how we wanted still took some technical effort. GPT made that work much faster, but I still needed to understand the templates and iterate on the results. The trade-off is worth it for us: the display is simple, readable, and customized to how our family actually organizes itself.  

We replaced the whiteboard with a digital, always up-to-date, family-friendly display. The part I appreciate most is that TRMNL doesn’t force us to change how we organize our family. It gives us a flexible surface and lets us shape it around the way we already work.