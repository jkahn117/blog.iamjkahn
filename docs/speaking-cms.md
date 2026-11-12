# Activate CMS editing for Speaking

This migration is prepared, not activated. The public page still uses the exact
11-entry snapshot in `src/lib/speaking-snapshot.ts` and is prerendered.
No CMS schema, content, or media has been written. Admin persistence, publication,
native signed preview, and browser layout checks remain unverified.

## Request approval before provisioning

1. Request approval to create the dedicated `speaking` collection and its single
   `speaking` entry using the proposal below. Do not add this proposal to an
   auto-discovered seed location or apply it to any existing database without approval.
2. After approval, provision the collection through native EmDash schema tools.
   Keep the entry slug `speaking`. This collection has one routable page, not a route
   for arbitrary entries. Do not change the shared `pages` collection.
3. Create the entry as a draft with all six conference, one meetup, and four webinar
   entries below, in that order. Keep the public snapshot active during this step.

## Activate only with the sitemap change

1. Request approval for local fixture writes and runtime testing before activation.
2. Change `export const prerender = true` to `false` in
   `src/pages/speaking.astro` on the verification branch. That literal also selects
   the prepared CMS query branch. Do not add an environment switch. Astro 7.4.7's
   `dist/core/routing/prerender.js` recognizes only literal boolean exports.
3. Coordinate the shared sitemap change with its owner before merging activation.
   The prerendered page currently appears in Astro's generated sitemap. An SSR
   page needs an explicit canonical `https://blog.iamjkahn.com/speaking` sitemap
   entry under the site's agreed missing-page policy. This ticket does not edit
   `astro.config.ts` or the shared sitemap.
4. Keep the metadata, navigation, section headings, and `Base` layout unchanged.
   The canonical URL excludes query parameters, including preview tokens.

Once activated, anonymous requests read only published data. Missing, unpublished,
or wrong-slug content returns 404. Query failures and invalid CMS field values
return 503. Both responses disable caching; neither silently serves the snapshot.
A valid native preview disables caching and adds `noindex, nofollow`.

## Verify authoring before publication

1. In `/_emdash/admin`, open the Speaking entry. Edit its heading and introduction.
   Edit each repeater field, change a row's group, and reorder rows with the native
   repeater controls. Rows retain their relative order within each fixed section.
2. Save the draft, close the editor, and reopen it. Compare every field and row order.
   Check that anonymous `/speaking` does not expose those unpublished edits.
3. Use the native signed preview link and compare the draft heading, introduction,
   group placement, links, and card order. Verify invalid and expired tokens do
   not expose drafts. Also test a token for another collection or Speaking entry.
4. Publish the approved original payload. Verify all 11 entries at `/speaking`,
   then save a new unpublished edit and confirm that anonymous readers still see
   the published version. Restore the original content only with write approval.
5. Compare desktop and mobile screenshots with the existing page. Check headings,
   typography, card spacing, navigation, metadata, and browser console errors.
6. Run `pnpm test`, `pnpm lint`, `pnpm format:check`, and `pnpm build`.
   Confirm `/speaking` remains in the sitemap after SSR activation.
7. Request separate approval for deployment. Do not activate production with an
   unprovisioned or unpublished Speaking entry.

Native preview path resolution in EmDash 1.4.0 uses the per-call `pathPattern`,
then `EMDASH_PREVIEW_PATH_PATTERN`, then collection `urlPattern`, then
`/{collection}/{id}`. Configure `urlPattern: "/speaking"` as proposed and check
that no project-wide override redirects this collection elsewhere. The route
uses only `getRequestContext().preview` verified by native middleware and
`getEmDashEntry`'s item-scoped draft resolution. No workaround route or custom
preview authentication is needed. Previews are not available on the current
prerendered snapshot until the approved local activation step.

## Proposed schema and draft content

This review-only seed-format payload is not installed or auto-discovered.
The native repeater supports scalar subfields, including `select` and `url`.
The renderer additionally rejects non-HTTP links, credentials, whitespace, and
control characters at the CMS boundary. Section labels remain fixed. Titles,
descriptions, event labels, destinations, calls to action, grouping, and row
ordering are editable through the native content editor.

Source APIs checked in the installed `emdash` package are
`src/schema/types.ts`, `src/seed/types.ts`, `src/query.ts`, and
`src/astro/routes/api/content/[collection]/[id]/preview-url.ts`.

`id` below is a seed-local identifier; the native content API uses the generated
database ID when requesting preview URLs.

```json
{
  "version": "1",
  "collections": [
    {
      "slug": "speaking",
      "label": "Speaking",
      "labelSingular": "Speaking page",
      "supports": ["drafts", "revisions", "preview"],
      "urlPattern": "/speaking",
      "routable": true,
      "fields": [
        {
          "slug": "title",
          "label": "Heading",
          "type": "string",
          "required": true
        },
        {
          "slug": "intro",
          "label": "Introduction",
          "type": "text",
          "required": true
        },
        {
          "slug": "talks",
          "label": "Speaking entries",
          "type": "repeater",
          "required": true,
          "validation": {
            "subFields": [
              {
                "slug": "group",
                "label": "Group",
                "type": "select",
                "required": true,
                "options": ["conferences", "meetups", "webinars"]
              },
              {
                "slug": "title",
                "label": "Title",
                "type": "string",
                "required": true
              },
              {
                "slug": "description",
                "label": "Description",
                "type": "text",
                "required": true
              },
              {
                "slug": "event",
                "label": "Event label",
                "type": "string",
                "required": true
              },
              {
                "slug": "href",
                "label": "Destination link",
                "type": "url",
                "required": true
              },
              {
                "slug": "cta",
                "label": "Call to action",
                "type": "string",
                "required": true
              }
            ]
          }
        }
      ]
    }
  ],
  "content": {
    "speaking": [
      {
        "id": "speaking-page",
        "slug": "speaking",
        "status": "draft",
        "data": {
          "title": "Speaking opportunities.",
          "intro": "One of my favorite ways to interact is live, in-person; though many of the best conversations aren't recorded.",
          "talks": [
            {
              "href": "https://www.youtube.com/watch?v=uqu7D6q1h34",
              "title": "Asynchronous frontends: Building seamless event-driven experiences (API305)",
              "description": "User interfaces by nature are event-driven—interactions trigger events that drive the application. But, integrations between the frontend and backend are often built synchronously using a request/response pattern. This session explores patterns to enable asynchronous, event-driven integrations with the frontend.",
              "event": "AWS re:Invent 2024",
              "cta": "Watch video",
              "group": "conferences"
            },
            {
              "href": "https://www.youtube.com/watch?v=jYbfQ07Z7rM",
              "title": "Implementing security best practices for serverless applications (SVS324)",
              "description": "Building with serverless enables organizations to build and deploy applications without managing underlying infrastructure. Serverless strengthens your overall security posture by reducing attack surface and shifting security operations to AWS.",
              "event": "AWS re:Invent 2024",
              "cta": "Watch video",
              "group": "conferences"
            },
            {
              "href": "https://www.youtube.com/watch?v=HSyE9nS5mMs",
              "title": "Patterns for Building Event-driven Web & Mobile App Backends",
              "description": "User interfaces by their nature are event driven - interactions trigger events that drive the application. But integrations between frontend and backend are often built synchronously using a request/response pattern.",
              "event": "GOTO EDA Day 2024 - Warsaw",
              "cta": "Watch video",
              "group": "conferences"
            },
            {
              "href": "https://www.youtube.com/watch?v=okshuSlDSpk&list=PLEx5khR4g7PJO9-CeWVBJ8If1C4jg7brx&index=9",
              "title": "Patterns for Building Event-driven Web & Mobile App Backends",
              "description": "User interfaces by their nature are event driven - interactions trigger events that drive the application. But integrations between frontend and backend are often built synchronously using a request/response pattern.",
              "event": "GOTO EDA Day 2024 - London",
              "cta": "Watch video",
              "group": "conferences"
            },
            {
              "href": "https://www.youtube.com/watch?v=U6Zz_Bj6yEY",
              "title": "Building APIs: Choosing the best API solution & strategy for workloads (SVS301)",
              "description": "Developers are building large-scale distributed applications that communicate between each other and clients via REST, GraphQL, WebSockets, and other means.",
              "event": "AWS re:Invent 2023",
              "cta": "Watch video",
              "group": "conferences"
            },
            {
              "href": "https://www.youtube.com/watch?v=A8iHQjHv8nY",
              "title": "Architecting secure serverless applications (SVS302)",
              "description": "This session explores how to think about security from the front to the back of a typical serverless application.",
              "event": "AWS re:Invent 2022",
              "cta": "Watch video",
              "group": "conferences"
            },
            {
              "href": "https://www.youtube.com/watch?v=YTeug7JjMoc",
              "title": "Seamlessly connect Stripe events to your frontend",
              "description": "Josh Kahn, Solution Architect at Stripe, demonstrates how to build event-driven architectures that connect payment processing to real-time user interfaces.",
              "event": "Stripe Developer Meet Up - Chicago, October 2025",
              "cta": "Watch video",
              "group": "meetups"
            },
            {
              "href": "https://www.youtube.com/watch?v=G2SmRkHcKE4",
              "title": "Why embedded finance is transforming modern businesses with Stripe Connect",
              "description": "Stripe Solution Architect Josh Kahn explains how embedded finance is revolutionizing the way businesses integrate financial services.",
              "event": "Stripe Tour New York 2025",
              "cta": "Watch video",
              "group": "webinars"
            },
            {
              "href": "https://youtu.be/DIsGgXfp7RI",
              "title": "Connecting Stripe events to frontends in realtime",
              "description": "The frontend is harder than you think. A conversation between Head of Stripe Developer Relations James Beswick and Stripe Solution Architect Josh Kahn.",
              "event": "Stripe Developer",
              "cta": "Watch video",
              "group": "webinars"
            },
            {
              "href": "https://www.youtube.com/watch?v=OJD3UMuU8Zk",
              "title": "Building Modern Apps with AWS: Choosing the Approach that Works for You",
              "description": "In this companion video to the AWS Modern Apps decision guide, decision guide manager Geof Wheelwright talks to co-author and AWS Serverless Tech Leader Josh Kahn.",
              "event": "AWS Modern Apps Decision Guide",
              "cta": "Watch video",
              "group": "webinars"
            },
            {
              "href": "https://www.youtube.com/watch?v=ZplOXryhX4k",
              "title": "Handling errors in a serverless world (SVS311)",
              "description": "Serverless technologies introduced new ways to build highly scalable, resilient applications without managing infrastructure.",
              "event": "AWS re:Invent 2020 (virtual)",
              "cta": "Watch video",
              "group": "webinars"
            }
          ]
        }
      }
    ]
  }
}
```
