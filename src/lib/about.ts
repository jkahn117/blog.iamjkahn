import type { EntryResult, SeedContentEntry } from "emdash";

import type { Page } from "../../emdash-env";

// Reviewable native pages payload. Not registered as a seed or applied to a CMS.
export const aboutPageSeed = {
  id: "about",
  slug: "about",
  status: "draft",
  data: {
    title: "I'm Josh Kahn. Solutions architect, speaker, technology guy, dad.",
    content: [
      "I've loved building things for as long as I can remember. From Legos to constructs to my first computer program with BASIC on my Apple IIe, I enjoy building and solving problems.",
      "After years of blogging on various platforms, I've tried to pull together almost 15 years of posts in one place. While mostly technical, you'll find a variety of topics discussed here, including a long ago trip to Australia.",
      "This site is built using Astro, Cloudflare Workers, and the Tailwind UI Spotlight theme.",
      "Enjoy! Josh",
    ].map((text, index) => ({
      _type: "block" as const,
      _key: `about-paragraph-${index + 1}`,
      style: "normal",
      markDefs: [],
      children: [
        {
          _type: "span" as const,
          _key: `about-span-${index + 1}`,
          text,
          marks: [],
        },
      ],
    })),
  },
} satisfies SeedContentEntry;

type AboutEntryQuery = (
  collection: "pages",
  slug: "about",
) => Promise<EntryResult<Page>>;

// Dormant until the /about route is activated. Native EmDash verifies preview tokens.
export async function getAboutPage(
  query: AboutEntryQuery = async (collection, slug) =>
    (await import("emdash")).getEmDashEntry(collection, slug),
): Promise<EntryResult<Page>> {
  const result = await query("pages", "about");
  if (result.error && result.error.name !== "LiveEntryNotFoundError")
    throw result.error;
  const page = result.entry;
  if (
    !page ||
    page.data.slug !== "about" ||
    (!result.isPreview && page.data.status !== "published")
  ) {
    return { entry: null, isPreview: result.isPreview, cacheHint: {} };
  }
  return result;
}
