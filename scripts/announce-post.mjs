#!/usr/bin/env node
/**
 * Announce new blog posts to Bluesky via AT Protocol.
 *
 * Usage: node scripts/announce-post.mjs <file1.md> [file2.md ...]
 *
 * Each file should be a path to a newly-added blog post markdown file.
 * Reads BLUESKY_HANDLE and BLUESKY_APP_PASSWORD from environment variables.
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { Agent, CredentialSession } from "@atproto/api";
import matter from "gray-matter";

const SITE_URL = "https://blog.iamjkahn.com";

const files = process.argv.slice(2).filter(Boolean);
if (files.length === 0) {
  console.log("No new posts to announce.");
  process.exit(0);
}

const { BLUESKY_HANDLE, BLUESKY_APP_PASSWORD } = process.env;
if (!BLUESKY_HANDLE || !BLUESKY_APP_PASSWORD) {
  console.error(
    "Missing BLUESKY_HANDLE or BLUESKY_APP_PASSWORD environment variables",
  );
  process.exit(1);
}

// Authenticate
const session = new CredentialSession(new URL("https://bsky.social"));
await session.login({
  identifier: BLUESKY_HANDLE,
  password: BLUESKY_APP_PASSWORD,
});
const agent = new Agent(session);
console.log("Bluesky login successful");

/**
 * Derive the blog post URL from the markdown filename.
 * YYYY-MM-DD-slug.md → https://blog.iamjkahn.com/posts/YYYY/MM/slug
 */
function fileToUrl(filePath) {
  const name = basename(filePath, ".md");
  const match = name.match(/^(\d{4})-(\d{2})-\d{2}-(.+)$/);
  if (!match) throw new Error(`Unexpected filename format: ${filePath}`);
  const [, year, month, slug] = match;
  return `${SITE_URL}/posts/${year}/${month}/${slug}`;
}

let failed = false;

for (const filePath of files) {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const { data } = matter(raw);
    const { title, summary, redirect_link } = data;

    if (!title) {
      console.warn(`Skipping ${filePath}: no title in frontmatter`);
      continue;
    }

    const postUrl = redirect_link ?? fileToUrl(filePath);
    const text = `Check out my new post: "${title}"`;

    await agent.post({
      text,
      embed: {
        $type: "app.bsky.embed.external",
        external: {
          uri: postUrl,
          title,
          description: summary ?? "",
        },
      },
      langs: ["en"],
    });

    console.log(`Announced: ${title}`);
    console.log(`  ${postUrl}`);
  } catch (err) {
    console.error(`Failed to announce ${filePath}:`, err);
    failed = true;
  }
}

if (failed) process.exit(1);
