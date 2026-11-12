import type { CacheHint } from "emdash";

export const speakingGroups = [
  { id: "conferences", title: "Conferences" },
  { id: "meetups", title: "Meet Ups" },
  { id: "webinars", title: "Webinars" },
] as const;

type SpeakingGroup = (typeof speakingGroups)[number]["id"];

export interface SpeakingTalk {
  group: SpeakingGroup;
  title: string;
  description: string;
  event: string;
  href: string;
  cta: string;
}

export interface SpeakingPage {
  title: string;
  intro: string;
  talks: SpeakingTalk[];
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Speaking content object.");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Speaking text fields must not be empty.");
  }
  return value;
}

function destination(value: unknown): string {
  const href = text(value);
  const url = new URL(href);
  if (
    !/^https?:\/\//i.test(href) ||
    url.username ||
    url.password ||
    href !== href.trim() ||
    [...href].some(
      (character) =>
        character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
    )
  ) {
    throw new Error(
      "Speaking links must be absolute HTTP or HTTPS URLs without credentials.",
    );
  }
  return url.href;
}

type SpeakingQuery = (
  collection: "speaking",
  id: string,
) => Promise<{
  entry: { data: unknown } | null;
  error?: Error;
  isPreview: boolean;
  cacheHint: CacheHint;
}>;

export async function loadSpeakingPage(
  query: SpeakingQuery,
  preview?: { collection: string; id: string },
) {
  const id = preview?.collection === "speaking" ? preview.id : "speaking";
  const result = await query("speaking", id);
  if (result.error && result.error.name !== "LiveEntryNotFoundError") {
    throw result.error;
  }
  return {
    page: readSpeakingPage(result.entry?.data, result.isPreview),
    isPreview: result.isPreview,
    cacheHint: result.cacheHint,
  };
}

// Only EmDash's verified query result may grant preview access, never a URL parameter.
export function readSpeakingPage(
  data: unknown,
  isPreview: boolean,
): SpeakingPage | null {
  if (data == null) return null;
  const page = record(data);
  if (page.slug !== "speaking" || (!isPreview && page.status !== "published")) {
    return null;
  }
  if (!Array.isArray(page.talks)) {
    throw new Error("Speaking talks must be a repeater array.");
  }
  return {
    title: text(page.title),
    intro: text(page.intro),
    talks: page.talks.map((value) => {
      const talk = record(value);
      const group = speakingGroups.find(({ id }) => id === talk.group)?.id;
      if (!group) throw new Error("Unknown Speaking group.");
      return {
        group,
        title: text(talk.title),
        description: text(talk.description),
        event: text(talk.event),
        href: destination(talk.href),
        cta: text(talk.cta),
      };
    }),
  };
}
