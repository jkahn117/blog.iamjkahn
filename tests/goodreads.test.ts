import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getCurrentlyReading,
  parseGoodreadsWidget,
} from "../src/lib/goodreads.ts";

function widget(
  title = "Josh&#39;s &amp; Jane&#39;s book",
  href = "https://www.goodreads.com/review/show/123",
) {
  const html = `<div class="gr_custom_container_"><div class="gr_custom_each_container_">
    <div class="gr_custom_book_container_"><a><img src="https://i.gr-assets.com/cover.jpg" /></a></div>
    <div class="gr_custom_title_"><a href="${href}">${title}</a></div>
    <div class="gr_custom_author_">by <a href="https://www.goodreads.com/author/show/1">An Author</a></div>
  </div></div>`;
  return `var widget_code = '${html.replaceAll("\\", "\\\\").replaceAll("'", "\\'").replaceAll('"', '\\"').replaceAll("\n", "\\n").replaceAll("/", "\\/")}'\n document.write(widget_code)`;
}

test("extracts book fields and decodes widget escapes and HTML entities without executing scripts", () => {
  assert.deepEqual(
    parseGoodreadsWidget(widget() + '; throw new Error("Do not execute")'),
    {
      title: "Josh's & Jane's book",
      author: "An Author",
      goodreadsLink: "https://www.goodreads.com/review/show/123",
      image: "https://i.gr-assets.com/cover.jpg",
    },
  );
  assert.equal(parseGoodreadsWidget(widget("1984"))?.title, "1984");
  assert.equal(
    parseGoodreadsWidget(widget("Josh's book"))?.title,
    "Josh's book",
  );
});

test("distinguishes empty shelves from missing or invalid widget responses", () => {
  assert.equal(
    parseGoodreadsWidget(
      `var widget_code = '<div class="gr_custom_container_"></div>'`,
    ),
    undefined,
  );
  for (const source of [
    "<html>Sign in</html>",
    "var widget_code = '<html>Not a widget</html>'",
    widget("", "https://www.goodreads.com/review/show/1"),
  ]) {
    assert.throws(() => parseGoodreadsWidget(source), /Goodreads/);
  }
});

test("rejects unsafe book links and omits untrusted cover URLs", () => {
  for (const url of [
    "javascript:alert(1)",
    "https://example.com/book",
    "https://www.goodreads.com.evil.test/book",
  ]) {
    assert.throws(
      () => parseGoodreadsWidget(widget("Book", url)),
      /Invalid Goodreads/,
    );
  }
  const source = widget().replace(
    "https:\\/\\/i.gr-assets.com\\/cover.jpg",
    "javascript:alert(1)",
  );
  assert.equal(parseGoodreadsWidget(source)?.image, undefined);
});

test("fetches the numeric user's widget and reports upstream failures", async (t) => {
  const fetchMock = t.mock.method(
    globalThis,
    "fetch",
    async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      assert.equal(url.pathname, "/review/custom_widget/102451238");
      assert.equal(url.searchParams.get("shelf"), "currently-reading");
      assert.equal(url.searchParams.get("num_books"), "1");
      return new Response(widget(), {
        headers: { "Content-Type": "text/javascript; charset=utf-8" },
      });
    },
  );
  assert.equal(
    (await getCurrentlyReading("102451238-josh-k"))?.author,
    "An Author",
  );
  fetchMock.mock.mockImplementation(
    async () => new Response("Not found", { status: 404 }),
  );
  await assert.rejects(getCurrentlyReading("102451238"), /HTTP 404/);
  fetchMock.mock.mockImplementation(
    async () =>
      new Response("Sign in", { headers: { "Content-Type": "text/html" } }),
  );
  await assert.rejects(
    getCurrentlyReading("102451238"),
    /did not return JavaScript/,
  );
  await assert.rejects(
    getCurrentlyReading("not-an-id"),
    /Invalid Goodreads user ID/,
  );
});

test("both widgets cache upstream data for one hour and require browser revalidation", () => {
  for (const name of ["Bluesky", "Goodreads"]) {
    const source = readFileSync(
      new URL(`../src/components/${name}.astro`, import.meta.url),
      "utf8",
    );
    assert.match(source, /cacheTime = ONE_HOUR/);
    assert.match(source, /headers.set\("Cache-Control", "no-cache"\)/);
    assert.doesNotMatch(source, /ONE_WEEK|\.swr\(/);
    assert.match(
      source,
      /cache\.internal\/(?:bluesky\/hourly-v1|goodreads\/widget-v1)\//,
    );
  }
});
