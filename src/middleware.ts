import type { MiddlewareHandler } from "astro";

/**
 * Handles legacy URL redirects from old Blogger.com URLs that Google previously indexed.
 *
 * Patterns handled:
 *   /{year}/{month}/{slug}.html  →  /posts/{year}/{month}/{slug}  (301)
 *   /{year}/{month}/{slug}       →  /posts/{year}/{month}/{slug}  (301)
 *
 * The /archive → /posts redirect is handled in astro.config.mjs.
 */
export const onRequest: MiddlewareHandler = ({ request, redirect }, next) => {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/(\d{4})\/(\d{2})\/(.+?)(?:\.html)?$/);
  if (match) {
    return redirect(`/posts/${match[1]}/${match[2]}/${match[3]}`, 301);
  }
  return next();
};
