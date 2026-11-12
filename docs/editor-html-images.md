# HTML-block images in the editor

## Finding and scope

Astro 7.4.7's dev server blocks local images requested by EmDash 1.4.0's sandboxed HTML-block preview. The same native editor component loads the image in an isolated Astro production-build preview. This confirms a dev-server limitation for the tested public asset, not successful production CMS authoring.

No application code, sandbox attributes, security headers, CMS records, schema, or media were changed. Actual CMS save/reopen and the site's Cloudflare build preview remain unverified. Ticket 02 is not ready to close.

## Why direct image requests succeed

The installed implementations explain the difference:

- `@emdash-cms/admin/dist/index.js`, `HtmlBlockPreview` and `PreviewFrame`, sanitize inline HTML and render it through `buildHtmlBlockFrame()` in an iframe with `sandbox="allow-scripts"`.
- `@emdash-cms/admin/dist/html-block.js` gives the frame a root-relative base URL. The sandbox deliberately omits `allow-same-origin`, so the frame has an opaque origin even when the image URL points to the local server.
- `astro/dist/vite-plugin-astro-server/sec-fetch.js`, `secFetchMiddleware`, rejects cross-site subresource requests with HTTP 403 and `Cross-origin request blocked`. The middleware is registered by the dev-server plugin, not the static preview server.
- `emdash/src/astro/middleware/auth.ts` applies the native `buildEmDashCsp()` policy outside development. Its `img-src` permits `'self' https: data: blob:`. The production-build fixture used this policy unchanged as an HTTP header.
- `emdash/src/components/HtmlBlock.astro` renders non-isolated blocks as sanitized inline HTML on the site. Successful article rendering therefore does not prove that the editor's sandbox can load the same image.

A direct navigation or same-origin article image does not make the same request as an image inside the editor frame. A successful `curl` without Fetch Metadata headers is also insufficient proof.

## Isolated reproduction results

The fixture used the installed `PortableTextEditor`, `I18nProvider`, and `QueryClientProvider`, bundled into a static page. It had no EmDash integration, authentication, database, storage adapter, or CMS API handlers. The image was a copy of the checked-in `public/images/1*X4qFk2B4tbSZgbaBOWdxTA.png`, served as `/images/historical.png`.

The editor input was:

```json
[
  {
    "_type": "htmlBlock",
    "_key": "historical",
    "html": "<img src=\"/images/historical.png\" width=\"250\" alt=\"Historical image\">"
  }
]
```

A separate headless Chrome 157 process used a fresh temporary profile and CDP. It did not use the shared browser session or disable browser protections. The native editor's **Preview** tab was visible in both runs.

| Observation                           | Astro dev, port 4422       | Isolated Astro build + preview, port 4423 |
| ------------------------------------- | -------------------------- | ----------------------------------------- |
| Direct/same-origin image HTTP status  | 200, `image/png`           | 200, `image/png`                          |
| Cross-site, no-CORS image HTTP status | 403, `text/plain`          | 200, `image/png`                          |
| Native editor frame image             | Broken, `naturalWidth = 0` | Visible, `naturalWidth = 1240`            |
| Frame origin                          | `null`                     | `null`                                    |
| Frame sandbox                         | `allow-scripts`            | `allow-scripts`                           |

The dev browser response was HTTP 403. The dev-server log identified `Sec-Fetch-Site: cross-site` and `Sec-Fetch-Mode: no-cors`. Preview returned HTTP 200 for the native editor frame's image request.

The fixture's save/reopen button serialized the current editor value with `JSON.stringify()`, parsed it, and remounted `PortableTextEditor`. The resulting JSON exactly matched the input above. After remounting in build preview, the image remained visible with `naturalWidth = 1240`, and accessing `parent.document` from the frame still threw a security error. No browser JavaScript exceptions were recorded. This checks component remounting and in-memory preservation, not CMS persistence.

The first standalone Astro fixture attempted to import the full site renderer through a symlinked dependency tree. Dev SSR failed with an unsupported `astro:` URL, and build failed on missing Astro compile metadata outside the fixture root. The successful comparison instead built a static page containing the native editor bundle. It did not build this site's Cloudflare application or exercise the article route.

### Read-only HTTP comparison

Against an already-running, approved local environment, compare the same public image with both request contexts. This does not save content:

```sh
ORIGIN=http://127.0.0.1:4422
ASSET=/images/historical.png
for SITE in same-origin cross-site; do
  curl --max-time 10 -sS -D - -o /dev/null \
    -H "Sec-Fetch-Site: $SITE" \
    -H 'Sec-Fetch-Mode: no-cors' \
    -H 'Sec-Fetch-Dest: image' \
    "$ORIGIN$ASSET"
done
```

Use an existing public asset path in the target environment. Repeat against the local build preview. This diagnoses the server boundary only. It does not replace the editor check.

## Authoring verification still required

The native editor component supports this HTML shape without changing the sandbox. The candidate local workflow is `pnpm build` followed by `pnpm preview`, rather than relying on `pnpm dev` for HTML-block image previews. This workflow still needs verification with the site's Cloudflare adapter and an approved disposable CMS fixture.

Before that verification, obtain approval for any CMS writes, including fixture creation, save, publish, and cleanup. Do not run migrations or point a test at existing CMS data without approval.

The remaining checks are:

- Open an approved fixture in the actual admin editor under the site's local production-build preview. Confirm the image is visible, not merely available by direct URL.
- Save through the CMS, reopen the entry, and compare its HTML-block JSON and image rendering.
- Render that fixture through the existing article route and confirm the image response and dimensions.
- Check that signed preview tokens do not appear in image URLs, referrers, logs, or public responses. The isolated fixture had no preview token and cannot prove this property.
- Confirm deployed production authoring after separate approval. No production requests or writes were made during this investigation.

Do not add `allow-same-origin`, allow an opaque `null` origin, disable Astro's cross-origin checks, relax CSP, or proxy private preview URLs to work around the dev limitation. Leave historical HTML unchanged while those checks are pending.
