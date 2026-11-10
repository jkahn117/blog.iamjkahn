import type { APIRoute } from "astro";
import { getEmDashEntry } from "emdash";

import { getPostPath } from "@/lib/posts";

export const prerender = false;

// EmDash admin previews default to /posts/{id}; keep signing and draft access in EmDash.
export const GET: APIRoute = async ({ params, url }) => {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
  };
  if (!params.id) return new Response("Not found", { status: 404, headers });
  const { entry, error, isPreview } = await getEmDashEntry("posts", params.id);
  if (error && error.name !== "LiveEntryNotFoundError") throw error;
  const path = entry && !entry.data.redirect_link && getPostPath(entry.data);
  if (!entry || !path || (!isPreview && entry.data.status !== "published")) {
    return new Response("Not found", { status: 404, headers });
  }
  const destination = new URL(path, url);
  const token = url.searchParams.get("_preview");
  if (isPreview && token) destination.searchParams.set("_preview", token);
  return new Response(null, {
    status: 302,
    headers: {
      ...headers,
      Location: destination.pathname + destination.search,
    },
  });
};
