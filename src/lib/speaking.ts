import { getEmDashCollection, getEmDashEntry, getRequestContext } from "emdash";
import type { CacheHint } from "emdash";

export const speakingGroups = [
  { id: "conferences", title: "Conferences" },
  { id: "meetups", title: "Meet Ups" },
  { id: "webinars", title: "Webinars" },
] as const;

type SpeakingGroup = (typeof speakingGroups)[number]["id"];

interface SpeakingTalk {
  id: string;
  group: SpeakingGroup;
  title: string;
  description: string;
  event: string;
  href: string;
  cta: string;
  sortOrder: number;
}

function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Speaking text fields must not be empty.");
  }
  return value;
}

function readTalk(value: unknown): SpeakingTalk {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Speaking entry.");
  }
  const talk = value as Record<string, unknown>;
  const group = speakingGroups.find(({ id }) => id === talk.group)?.id;
  if (!group) throw new Error("Unknown Speaking group.");
  if (
    typeof talk.sort_order !== "number" ||
    !Number.isInteger(talk.sort_order)
  ) {
    throw new Error("Speaking display order must be an integer.");
  }
  const href = text(talk.href);
  const url = new URL(href);
  if (
    !/^https?:\/\//i.test(href) ||
    url.username ||
    url.password ||
    [...href].some(
      (character) =>
        character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
    )
  ) {
    throw new Error(
      "Speaking links must use HTTP or HTTPS without credentials or whitespace.",
    );
  }
  return {
    id: text(talk.id),
    group,
    title: text(talk.title),
    description: text(talk.description),
    event: text(talk.event),
    href: url.href,
    cta: text(talk.cta),
    sortOrder: talk.sort_order,
  };
}

export async function getSpeakingTalks() {
  const talks = new Map<string, SpeakingTalk>();
  const cacheHints: CacheHint[] = [];
  let cursor: string | undefined;
  do {
    const result = await getEmDashCollection("speaking", {
      status: "published",
      limit: 100,
      cursor,
    });
    if (result.error) throw result.error;
    cacheHints.push(result.cacheHint);
    for (const entry of result.entries) {
      if (entry.data.status === "published") {
        const talk = readTalk(entry.data);
        talks.set(talk.id, talk);
      }
    }
    cursor = result.nextCursor;
  } while (cursor);

  let isPreview = false;
  const preview = getRequestContext()?.preview;
  if (preview?.collection === "speaking") {
    const result = await getEmDashEntry("speaking", preview.id);
    if (result.error && result.error.name !== "LiveEntryNotFoundError")
      throw result.error;
    if (result.isPreview && result.entry) {
      const talk = readTalk(result.entry.data);
      talks.set(talk.id, talk);
      isPreview = true;
    }
  }
  return {
    talks: [...talks.values()].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
    ),
    isPreview,
    cacheHints,
  };
}
