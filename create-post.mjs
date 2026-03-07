#!/usr/bin/env node

import fs from "fs";
import slug from "slug";
import { input, select } from "@inquirer/prompts";

const title = await input({
  message: "Title: "
});

const titleSlug = await input({
  message: "Slug: ",
  default: slug(title)
});

const style = await select({
  message: "Post style: ",
  choices: [
    {
      value: "local",
      name: "local",
      description: "Post on this blog",
      default: true
    },
    {
      value: "link",
      name: "link",
      description: "Link post"
    }
  ]
});

let url = null;
if (style === "link") {
   url = await input({
    message: "Link URL: "
  });
};

const now = new Date();
const date = {
  year: await input({ message: "Year: ", default: String(now.getFullYear()) }),
  month: await input({ message: "Month: ", default: String(now.getMonth() + 1).padStart(2, "0") }),
  date: await input({ message: "Date: ", default: String(now.getDate()).padStart(2, "0") })
};

const paddedMonth = String(date.month).padStart(2, "0");
const paddedDay = String(date.date).padStart(2, "0");
const postSlug = `${date.year}-${paddedMonth}-${paddedDay}-${titleSlug}`;

// check for existing file
if (fs.existsSync(`./src/content/blog/${postSlug}.md`)) {
  throw "Post with this slug already exists"
}

let frontMatter = `---
date: "${new Date(date.year, Number(date.month) - 1, date.date).toISOString()}"
title: "${title}"
author: "Josh"
summary: ""
`;

if (style === "link" && url) {
  frontMatter = frontMatter.concat(`redirect_link: ${url}\n`);
}

frontMatter = frontMatter.concat("---");

fs.writeFileSync(
  `./src/content/blog/${postSlug}.md`,
  frontMatter
);
