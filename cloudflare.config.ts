import { bindings, defineConfig } from "cf/config";

/**
 * Secret-like files were detected but not read or migrated: .env, dist/server/.dev.vars. Only `secrets.required` entries are migrated.
 * @see https://developers.cloudflare.com/workers/configuration/secrets/
 */

export default defineConfig({
	worker: {
		name: "iamjkahn-blog",
		compatibilityDate: "2025-01-01",
		compatibilityFlags: [
			"nodejs_compat",
		],
		workersDev: false,
		observability: {
			enabled: true,
		},
		domains: [
			"blog.iamjkahn.com",
		],
		env: {
			SITE_URL: bindings.text("https://blog.iamjkahn.com"),
			PUBLIC_BLUESKY_HANDLE: bindings.text("iamjkahn.com"),
			CDN: bindings.text("cloudflare"),
			ASSETS: bindings.assets(),
		},
	},
});
