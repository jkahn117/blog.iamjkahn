import { BlobRef, jsonToLex, lexicons } from "@atproto/api";
import type { PluginContext } from "emdash";

export const UPLOAD_URL =
  "https://bsky.social/xrpc/com.atproto.repo.uploadBlob";
// app.bsky.embed.external's thumbnail limit in the installed lexicon.
const MAX_IMAGE_BYTES = 1000000;
// EmDash's maximum bounded media read, below the Images binding's input limit.
const MAX_SOURCE_BYTES = 16 * 1024 * 1024;

async function readThumbnail(response: Response): Promise<Uint8Array | null> {
  if (
    !response.ok ||
    response.headers.get("Content-Type") !== "image/jpeg" ||
    !response.body
  )
    throw new Error("INVALID_IMAGE_TRANSFORM");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!size) throw new Error("INVALID_IMAGE_TRANSFORM");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function prepareImage(bytes: Uint8Array, mimeType: string) {
  if (
    bytes.byteLength <= MAX_IMAGE_BYTES &&
    ["image/jpeg", "image/png"].includes(mimeType)
  )
    return { bytes, mimeType };
  const { env } = await import("cloudflare:workers");
  if (!env.IMAGES) throw new Error("IMAGES_UNAVAILABLE");
  // Use the original for each attempt. Never crop, upscale, or repeatedly encode.
  for (const { edge, quality } of [
    { edge: 1200, quality: 80 },
    { edge: 800, quality: 65 },
  ]) {
    const result = await env.IMAGES.input(
      new Blob([new Uint8Array(bytes).buffer]).stream(),
    )
      .transform({ width: edge, height: edge, fit: "scale-down" })
      .output({
        format: "image/jpeg",
        quality,
        anim: false,
        background: "#ffffff",
      });
    const thumbnail = await readThumbnail(result.response());
    if (thumbnail) return { bytes: thumbnail, mimeType: "image/jpeg" };
  }
  throw new Error("FEATURED_IMAGE_TOO_LARGE");
}

export function featuredImageId(
  content: Record<string, unknown>,
): string | undefined {
  const data = content.data as Record<string, unknown>;
  const image = data.featured_image;
  if (image == null) return undefined;
  if (
    typeof image !== "object" ||
    !("id" in image) ||
    typeof image.id !== "string" ||
    !image.id.trim()
  )
    throw new Error("INVALID_FEATURED_IMAGE");
  return image.id;
}

export async function uploadFeaturedImage(
  id: string,
  accessJwt: string,
  ctx: Pick<PluginContext, "media" | "http">,
): Promise<BlobRef> {
  if (!ctx.media?.readBytes || !ctx.http) throw new Error("MEDIA_UNAVAILABLE");
  // Read only the selected CMS asset, never src, OG metadata, or an avatar fallback.
  const source = await ctx.media.readBytes(id, { maxBytes: MAX_SOURCE_BYTES });
  if (
    !source.mimeType.startsWith("image/") ||
    source.bytes.byteLength === 0 ||
    source.bytes.byteLength > MAX_SOURCE_BYTES
  )
    throw new Error("INVALID_FEATURED_IMAGE");
  const image = await prepareImage(source.bytes, source.mimeType);
  const response = await ctx.http.fetch(UPLOAD_URL, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(8000),
    headers: {
      Authorization: `Bearer ${accessJwt}`,
      "Content-Type": image.mimeType,
    },
    body: new Uint8Array(image.bytes).buffer,
  });
  if (!response.ok) throw new Error("IMAGE_UPLOAD_REJECTED");
  const result = jsonToLex(await response.json());
  lexicons.assertValidXrpcOutput("com.atproto.repo.uploadBlob", result);
  if (
    !result ||
    typeof result !== "object" ||
    !("blob" in result) ||
    !(result.blob instanceof BlobRef) ||
    result.blob.mimeType !== image.mimeType ||
    result.blob.size !== image.bytes.byteLength
  )
    throw new Error("INVALID_IMAGE_UPLOAD");
  return result.blob;
}
