import assert from "node:assert/strict";
import test from "node:test";

import {
  getPostFilterOptions,
  matchesPostFilters,
  setPostFilterParams,
} from "../src/lib/post-filters.ts";

const cloud = { slug: "cloud", label: "Cloud" };
const life = { slug: "life", label: "Life" };
const era = { slug: "era-aws", label: "AWS and serverless" };

test("filter options deduplicate and sort terms from the public listing", () => {
  assert.deepEqual(
    getPostFilterOptions([
      { categories: [life, cloud], eras: [era] },
      { categories: [cloud], eras: [] },
      { categories: [], eras: [era] },
    ]),
    { categories: [cloud, life], eras: [era] },
  );
  assert.deepEqual(getPostFilterOptions([]), { categories: [], eras: [] });
});

test("filters combine category and era without changing listing order", () => {
  const posts = [
    { categories: ["cloud"], eras: ["era-aws"] },
    { categories: ["life", "cloud"], eras: [] },
    { categories: [], eras: ["era-aws"] },
    { categories: [], eras: [] },
  ];
  const filter = (category: string, era: string) =>
    posts.filter((post) => matchesPostFilters(post, category, era));
  assert.deepEqual(filter("", ""), posts);
  assert.deepEqual(filter("cloud", ""), posts.slice(0, 2));
  assert.deepEqual(filter("", "era-aws"), [posts[0], posts[2]]);
  assert.deepEqual(filter("cloud", "era-aws"), [posts[0]]);
  assert.deepEqual(filter("life", "era-aws"), []);
  assert.deepEqual(filter("unknown", ""), []);
});

test("URL updates preserve unrelated parameters and fragments and clear both filters", () => {
  const original = new URL(
    "https://example.com/posts?ref=home&category=old&category=duplicate#post-list",
  );
  const filtered = setPostFilterParams(original, "cloud", "era-aws");
  assert.equal(filtered.search, "?ref=home&category=cloud&era=era-aws");
  assert.equal(filtered.hash, "#post-list");
  assert.equal(original.searchParams.get("category"), "old");
  assert.equal(
    setPostFilterParams(filtered, "", "").href,
    "https://example.com/posts?ref=home#post-list",
  );
});
