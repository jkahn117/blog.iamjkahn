/**
 * Derive the URL slug from a blog post's collection ID.
 *
 * Post IDs follow the pattern "YYYY-MM-DD-slug" (the day component is
 * stripped from the URL).  Example:
 *   "2024-12-12-my-post" → "2024/12/my-post"
 */
export function getPostSlug(postId: string): string {
  const [year, month, , ...rest] = postId.replace(/\.md$/, "").split("-");
  return `${year}/${month}/${rest.join("-")}`;
}
