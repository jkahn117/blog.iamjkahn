import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Bluesky caches upstream data for one hour and requires browser revalidation", () => {
  const source = readFileSync(
    new URL("../src/components/Bluesky.astro", import.meta.url),
    "utf8",
  );
  assert.match(source, /const ONE_HOUR = 60 \* 60;/);
  assert.match(source, /cacheTime = ONE_HOUR/);
  assert.match(source, /headers.set\("Cache-Control", "no-cache"\)/);
  assert.doesNotMatch(source, /cdn-cache-control|ONE_WEEK|\.swr\(/);
  assert.match(source, /cache\.internal\/bluesky\/hourly-v1\//);
});
