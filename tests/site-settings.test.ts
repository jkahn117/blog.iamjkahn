import assert from "node:assert/strict";
import test from "node:test";

import { getSocialLinks, safeHttpUrl } from "../src/lib/site-settings.ts";

test("settings URLs allow HTTP(S) and resolve local media paths", () => {
  assert.equal(
    safeHttpUrl("https://github.com/example"),
    "https://github.com/example",
  );
  assert.equal(
    safeHttpUrl("/_emdash/api/media/file/avatar", "https://blog.iamjkahn.com"),
    "https://blog.iamjkahn.com/_emdash/api/media/file/avatar",
  );
});

test("settings URLs reject executable schemes, credentials, and control characters", () => {
  for (const value of [
    undefined,
    {},
    "not a URL",
    "javascript:alert(1)",
    "data:text/html,hello",
    "https://user:password@example.com",
    "https://exam\nple.com",
    "https://example.com/\u007f",
  ]) {
    assert.equal(safeHttpUrl(value), undefined);
  }
});

test("social links omit missing or unsafe settings without restoring template values", () => {
  assert.deepEqual(
    getSocialLinks({
      github: "https://github.com/example",
      twitter: "javascript:alert(1)",
    }),
    {
      github: "https://github.com/example",
      linkedin: undefined,
      twitter: undefined,
    },
  );
});
