import { XMLParser } from "fast-xml-parser";

export type Book = {
  title: string;
  author?: string;
  goodreadsLink: string;
  image?: string;
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function safeUrl(value: unknown, hosts: string[]): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      hosts.includes(url.hostname) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export function parseGoodreadsWidget(source: string): Book | undefined {
  // Read only the widget's string literal. Never evaluate third-party JavaScript.
  const literal = source.match(
    /\bvar\s+widget_code\s*=\s*'((?:\\.|[^'\\])*)'/s,
  )?.[1];
  if (literal === undefined) throw new Error("Goodreads widget string missing");
  const escapes: Record<string, string> = {
    n: "\n",
    r: "\r",
    t: "\t",
    b: "\b",
    f: "\f",
    "\\": "\\",
    "'": "'",
    '"': '"',
    "/": "/",
  };
  const html = literal.replace(/\\([\s\S])/g, (_, escape: string) => {
    const decoded = escapes[escape];
    if (decoded === undefined)
      throw new Error("Unsupported Goodreads widget escape");
    return decoded;
  });
  if (!html.includes('class="gr_custom_container_')) {
    throw new Error("Goodreads widget container missing");
  }
  if (!html.includes('class="gr_custom_each_container_')) return undefined;

  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    unpairedTags: ["img"],
    htmlEntities: true,
  });
  function linkIn(section: string): Record<string, unknown> {
    const fragment = html.match(
      new RegExp(
        `<div\\s+class="gr_custom_${section}_[^"]*"[^>]*>([\\s\\S]*?)<\\/div>`,
      ),
    )?.[1];
    return fragment ? record(record(parser.parse(fragment) as unknown).a) : {};
  }

  const titleLink = linkIn("title");
  const title = text(titleLink["#text"]);
  const goodreadsLink = safeUrl(titleLink["@_href"], [
    "www.goodreads.com",
    "goodreads.com",
  ]);
  if (!title || !goodreadsLink)
    throw new Error("Invalid Goodreads widget book");

  return {
    title,
    goodreadsLink,
    author: text(linkIn("author")["#text"]),
    image: safeUrl(record(linkIn("book_container").img)["@_src"], [
      "i.gr-assets.com",
      "images.gr-assets.com",
    ]),
  };
}

export async function getCurrentlyReading(
  userId: string,
): Promise<Book | undefined> {
  const id = userId.match(/^\d+(?=-|$)/)?.[0];
  if (!id) throw new Error("Invalid Goodreads user ID");
  const url = new URL(`https://www.goodreads.com/review/custom_widget/${id}`);
  url.search = new URLSearchParams({
    shelf: "currently-reading",
    num_books: "1",
    show_author: "1",
    show_cover: "1",
    show_title: "1",
    show_rating: "0",
    show_review: "0",
    sort: "date_added",
    order: "d",
  }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok)
    throw new Error(`Goodreads widget returned HTTP ${response.status}`);
  if (
    !/^(?:text|application)\/javascript\b/i.test(
      response.headers.get("Content-Type") ?? "",
    )
  ) {
    throw new Error("Goodreads widget did not return JavaScript");
  }
  return parseGoodreadsWidget(await response.text());
}
