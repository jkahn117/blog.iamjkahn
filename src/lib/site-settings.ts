import type { SiteSettings } from "emdash";

export function getSocialLinks(social: SiteSettings["social"]) {
  return {
    github: safeHttpUrl(social?.github),
    linkedin: safeHttpUrl(social?.linkedin),
    twitter: safeHttpUrl(social?.twitter),
  };
}

export function safeHttpUrl(value: unknown, base?: string): string | undefined {
  if (typeof value !== "string" || /\p{Cc}/u.test(value)) return undefined;

  try {
    const url = base ? new URL(value, base) : new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
