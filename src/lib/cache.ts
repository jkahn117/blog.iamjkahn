// Utility hook to simplify caching behavior for server rendered
// components that pull data from other APIs
export async function withCache<T>(
  key: Request,
  fetcher: () => Promise<T | undefined>,
  options: { isDev: boolean; cacheTime: number; ctx: ExecutionContext },
): Promise<T | undefined> {
  const { isDev, cacheTime, ctx } = options;

  if (isDev) return fetcher();

  // caches.open() avoids a type conflict between the DOM CacheStorage interface
  // and the Cloudflare Workers class. caches.default is equivalent.
  const cache = await caches.open("default");
  const cached = await cache.match(key);

  if (cached) return (await cached.json()) as T;

  const fresh = await fetcher();

  if (fresh) {
    const toCache = new Response(JSON.stringify(fresh), {
      headers: { "Cache-Control": `public, max-age=${cacheTime}` },
    });
    ctx.waitUntil(cache.put(key, toCache));
  }

  return fresh;
}
