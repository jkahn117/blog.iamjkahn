import type { MiddlewareHandler } from "astro";

// Run outside EmDash so early setup/auth/runtime responses are checked too.
export const onRequest: MiddlewareHandler = async (context, next) => {
  const { cache, request, url } = context;
  const isPreviewOrEdit =
    url.searchParams.has("_preview") || url.searchParams.has("_edit");
  // Capture the route rule before query/layout hints can enable caching.
  const hasPublicRule = cache?.options.maxAge !== undefined;
  let response: Response;
  try {
    response = await next();
  } catch (error) {
    cache?.set(false);
    throw error;
  }
  if (!cache?.enabled) return response;

  if (
    !hasPublicRule ||
    cache.options.maxAge === undefined ||
    response.status !== 200 ||
    !["GET", "HEAD"].includes(request.method) ||
    isPreviewOrEdit ||
    context.locals.user ||
    request.headers.has("Authorization") ||
    response.headers.has("Set-Cookie") ||
    /\b(?:private|no-store)\b/i.test(
      response.headers.get("Cache-Control") ?? "",
    )
  ) {
    // set(false) alone does not remove CDN headers supplied by a component.
    cache.set(false);
    response.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
    response.headers.delete("Cache-Tag");
    if (isPreviewOrEdit) {
      response.headers.set("Cache-Control", "private, no-store");
    }
  } else {
    // Browsers cannot receive EmDash's tag purges. Revalidate every visit.
    response.headers.set("Cache-Control", "no-cache");
  }
  return response;
};
