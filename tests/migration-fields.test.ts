import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

// Compile this small admin module without starting the dev server or EmDash.
const source = await readFile(
  new URL("../src/admin/migration-fields.tsx", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
const moduleUrl = `data:text/javascript,${encodeURIComponent(
  compiled.replaceAll(
    '"react/jsx-runtime"',
    JSON.stringify(import.meta.resolve("react/jsx-runtime")),
  ),
)}`;
const { fields, contentEditorPanels } = (await import(
  moduleUrl
)) as typeof import("../src/admin/migration-fields.tsx");
const panel = contentEditorPanels[0]!;

await test("migration details are limited to posts with migration data", () => {
  assert.deepEqual(panel.collections, ["posts"]);
  for (const data of [{}, { legacy_route: "" }, { legacy_route: null }]) {
    const context = { entry: { data } };
    assert.equal(panel.isVisible(context), false);
    assert.equal(
      renderToStaticMarkup(createElement(panel.component, context)),
      "",
    );
  }
  assert.equal(
    panel.isVisible({ entry: { data: { migration_source_hash: "abc" } } }),
    true,
  );
});

await test("legacy values render collapsed, escaped, and read-only", () => {
  const data = Object.freeze({
    legacy_route: "2007/10/original-route",
    legacy_published_at: "2007-11-01T00:48:36.000Z",
    migration_source_path: "<script>alert(1)</script>",
    migration_source_hash: "source-hash",
    migration_payload_hash: "payload-hash",
  });
  const before = JSON.stringify(data);
  const html = renderToStaticMarkup(
    createElement(panel.component, { entry: { data } }),
  );
  assert.match(html, /<details\b/);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b/);
  assert.match(html, /2007\/10\/original-route/);
  assert.match(html, /2007-11-01T00:48:36\.000Z/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /source-hash/);
  assert.match(html, /payload-hash/);
  assert.doesNotMatch(html, /<(input|textarea|select|script)\b/);
  assert.equal(JSON.stringify(data), before);
  assert.equal(renderToStaticMarkup(createElement(fields.hidden)), "");
});

await test("missing migration values are explicitly marked", () => {
  const html = renderToStaticMarkup(
    createElement(panel.component, {
      entry: { data: { legacy_route: "2007/10/original-route" } },
    }),
  );
  assert.equal(html.match(/Not set/g)?.length, 4);
});
