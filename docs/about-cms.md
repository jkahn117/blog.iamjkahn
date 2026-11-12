# Activate the CMS About page

Ticket 08 is staged, not activated. `/about` still prerenders the existing biography without a CMS query. No About record, collection setting, or media migration has been applied. The required build initialized EmDash's default collections in fresh disposable worktree-local `.wrangler/state/` storage. That initialization does not provision About or verify the admin workflow. Admin editing, save/reopen, signed preview, publication, and browser layout verification remain unverified.

## Provision only after approval

1. Obtain approval to create or update the About record and any collection settings. Do not overwrite an existing record without reviewing its contents.
2. Use the native `pages` collection with its existing `title` and Portable Text `content` fields. Keep the slug `about`. The title is the visible biography heading, not the fixed browser title `About - Josh Kahn`.
3. Review `aboutPageSeed` in [`src/lib/about.ts`](../src/lib/about.ts). It preserves the existing heading and every biography paragraph as a native draft content payload. It is not registered with EmDash and never applies itself. Use its `slug`, `status`, and `data` only after approval. No portrait or social-link migration is needed.
4. Inspect the pages collection URL pattern. Prefer `/{slug}` so native admin preview and published links resolve to `/about`. Approve this collection-wide setting only after checking every existing page for route conflicts. Do not set a global preview pattern that changes post previews. If this pattern is unsuitable, stop and agree on an About-only preview adapter before activation.
5. Save and reopen the draft in the admin. Publish the initial preserved biography before changing the public route. Preview verification requires an activated disposable fixture, as described below.

## Activate the request-time route

After provisioning and approval, replace [`src/pages/about.astro`](../src/pages/about.astro) with the following route. This code uses the prepared native query helper and the same presentation as the prerendered page.

```astro
---
export const prerender = false;

import AboutProfile from "@/components/AboutProfile.astro";
import { getAboutPage } from "@/lib/about";

const { entry: page, isPreview, cacheHint } = await getAboutPage();
const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
};
if (!page) {
  return new Response("Not found", { status: 404, headers: privateHeaders });
}
if (isPreview) {
  for (const [name, value] of Object.entries(privateHeaders)) {
    Astro.response.headers.set(name, value);
  }
} else if (Astro.cache?.enabled) {
  Astro.cache.set(cacheHint);
}
---

<AboutProfile
  title={page.data.title}
  content={page.data.content}
  edit={page.edit}
/>
```

Astro 7.4.7 recognizes only literal `prerender = true` or `false` exports. Do not substitute an environment expression. This manual activation needs a rebuild. Later CMS publications use live request-time queries and need no rebuild. Keep unrelated routes prerendered.

`getAboutPage()` uses native `getEmDashEntry("pages", "about")`. EmDash verifies signed preview tokens and chooses draft revisions. The helper rejects other slugs and non-published results unless native `isPreview` authorizes them. It does not infer preview authority from a query parameter. Query failures surface as server errors rather than silently replacing public content.

Keep the local plain 404 response until the shared request-time 404 design is integrated. Never render an unavailable page's title, biography, or draft metadata in that response.

## Coordinate canonical and sitemap handling

The shared `Base.astro` layout preserves the fixed title, description, and canonical `https://blog.iamjkahn.com/about`. Query strings, including preview tokens, never enter the canonical URL.

The current prerendered route is included by Astro's sitemap integration. Before activating SSR, coordinate an explicit `/about` entry with the shared sitemap owner. Include it only when the CMS About page is published. Never list preview URLs or unpublished pages. This lane does not change `astro.config.ts` or the shared sitemap.

## Verify before launch

1. Run `pnpm test`, `pnpm lint`, `pnpm format:check`, and `pnpm build` in a disposable worktree. Builds can initialize native default collections in local Wrangler storage. Run `EMDASH_ABOUT_BUILD_TEST=1 pnpm test` after the build to check the current prerendered HTML and sitemap without starting another CMS runtime. That assertion covers the inactive route only; update it when activation replaces the snapshot.
2. In an approved disposable CMS fixture, edit the title and biography through the admin. Save, leave the editor, and reopen the record. Confirm both fields persisted.
3. Generate a native signed preview. Confirm the unpublished edits render with `private, no-store`, `noindex, nofollow`, and `no-referrer` response headers. Confirm the canonical remains `/about` without the token.
4. Open `/about` anonymously. Confirm only the published biography renders. Repeat with an invalid token, an expired token, and a valid token for a different page. None may expose the draft biography or draft metadata.
5. Publish the edits. Confirm the next anonymous request shows the new text without a rebuild. Restore the preserved biography only with approval.
6. In an isolated fixture, unpublish or remove About. Confirm an anonymous request returns 404 without private content. Verify the sitemap omits the page.
7. Check desktop and mobile layouts, light and dark themes, the portrait, navigation, social destinations, typography, and metadata against the prerendered page.

The fixture tests in [`tests/about.test.ts`](../tests/about.test.ts) cover the proposed biography payload, native query arguments, publication filtering, preview-authorized results, wrong-page rejection, and query failures. They do not prove native token verification or admin persistence. Those checks require the approved CMS fixture above. Do not activate or deploy on fixture-test evidence alone.
