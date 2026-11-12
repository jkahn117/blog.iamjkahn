# Historical managed media: read-only planning

Ticket 03 is **partially implemented, not imported**. The tool performs no network
requests, uploads, CMS/schema writes, or asset deletion. It reads a historical
migration plan, static files, and an optional previously obtained media snapshot;
JSON goes to stdout. It does not open the CMS database or start the site.

The repository's separate `pnpm build` is **not read-only**: EmDash initializes
and auto-seeds a fresh worktree-local `.wrangler/state/` D1 database while
prerendering. This occurred during the required build check; no existing CMS data
or credentials were copied into this worktree. Do not use a site build/start as a
substitute for this offline dry run when schema writes are prohibited.

## Run the dry run

From the repository root with Node 24+ and frozen-lockfile dependencies installed:

```sh
node scripts/managed-media.ts /absolute/path/to/full-local.json public \
  > /tmp/managed-media-plan.json
```

The first input has the existing historical migration shape:
`{ "posts": [{ "sourcePath": "...", "payload": { "status": "draft", "data": { "content": [] } } }] }`.
It is a historical snapshot, **not evidence of the current CMS contents**.
Parent `.migration/` plans, manifests, and recovery archives remain read-only.

Optionally supply an approved, complete, paginated media-library export as a flat
JSON array of EmDash 1.4 media items (not an API response envelope):

```sh
node scripts/managed-media.ts /absolute/path/to/full-local.json public \
  /absolute/path/to/media-snapshot.json > /tmp/managed-media-plan.json
```

Required media fields are `id`, `storageKey`, `status`, and `contentHash` (nullable).
No credentials belong in these inputs. Without this snapshot, every local image
is only an upload **proposal**; library duplication/reuse cannot be verified.
An explicitly empty snapshot is distinguished from an omitted one.

## Inventory and proposals

- Native Portable Text images, gallery image assets, and `<img src>` inside
  `htmlBlock` content are inventoried. HTML comments and script/style/textarea
  bodies are ignored. Raw HTML stays raw HTML; it is not converted into native
  image blocks, which could lose layout and links.
- References are classified as `managed`, `recovered-local` (present in the
  supplied public tree), `remote`, `accepted-gap`, or `unresolved`. Existing
  managed references and remote images are retained; remote images are never
  downloaded. Managed classification is structural, not a liveness check.
- The two accepted gaps are `/assets/images/2020-09-08/jwt_creation.png` and
  `/assets/images/2020-09-08/apigw_apikeysource_setting.png`. They are excluded
  from recovery/mappings and do not block planning, even if a file later appears.
- Local matching uses the exact decoded public path, not a guessed basename.
  Missing paths expose all same-basename candidates for review. Responsive
  `srcset`, duplicate sources, encoded/unquoted HTML sources, and sourceless image
  tags are flagged for manual review, not silently transformed. This is a
  conservative historical-content scanner, not a general HTML parser.
- Each local image has its full-byte SHA-256 audit digest, EmDash-compatible
  `sha1:...` content hash, byte count, format, and intrinsic dimensions. Files
  are read without conversion; symlinks are not followed. Recovery metadata is
  not substituted for per-occurrence alt text or display dimensions.
- Mappings group identical bytes under a `sha256:...` key. Duplicate paths and
  repeated references are reported. A single matching ready media item proposes
  reuse; multiple matches or any matching pending/failed record require review.
  SHA-1 reuse candidates still need full-byte reconciliation before real writes.
- Each reference includes its exact payload path (and HTML source span), proposed
  operation, and mapping key. New uploads have no invented media IDs. Once an
  approved upload supplies a real ID/storage key, that mapping can be resolved.
  `reviewRequired: 0` does **not** mean uploads or CMS edits are approved.

`proposePostReferences(payload, expectedHash, mappings)` is a pure testable seam,
not a write API. Mappings use original source URLs as keys and `{ id, url }` as
values; URLs must be internal `/_emdash/api/media/file/...` URLs. It clones the
payload, changes only native `asset._ref`/`asset.url` or the HTML `src` span, and
returns the proposed payload plus a no-writes receipt. Alt text, dimensions,
captions, links, layout attributes, block identity, status, dates, and all other
fields remain unchanged. Repeating it on the proposed payload makes no changes.
It refuses stale payload hashes, unsafe URLs, unsupported HTML, and accepted-gap
replacements. It never applies a proposal to disk or the CMS.

## Native API findings and write boundary

The configured provider remains `r2({ binding: "MEDIA" })` in `astro.config.ts`;
no infrastructure or provider changes are proposed. Installed EmDash 1.4 sources
were checked at:

- `src/utils/hash.ts`: `computeContentHash()` uses prefixed SHA-1.
- `src/api/handlers/media-upload.ts`: configured-storage upload, hash reuse,
  metadata enrichment, and cleanup on record-creation failure.
- `src/content/converters/{portable-text-to-prosemirror,prosemirror-to-portable-text}.ts`:
  native assets use `_ref` plus `url` for editor round trips.
- `src/media/usage/extractor.ts`: native/gallery assets are indexed, **raw HTML
  URLs are not**. HTML managed URLs must therefore not be treated as complete
  media-usage coverage or as permission to delete apparently unused library items.

No uploader or apply command is included. Before introducing one, obtain explicit
approval for the target and content/media writes, and use a disposable isolated
CMS/storage fixture. Do not run an import against the existing local database.
A planning-time hash check is **not atomic concurrency protection**: an approved
writer must compare the current CMS revision and enforce a conditional update
at the actual write seam, or stop if that facility is unavailable.

Retain the deterministic plan (`planHash`, all input hashes, per-post before
hashes), source bytes and SHA-256s. A future execution receipt must record actual
media IDs/storage keys, deduplication results, upload/patch attempts and failures,
CMS revision before/after, per-post after hashes, and reconciliation results.
On resume, reconcile those actual records and fresh CMS revisions before doing
anything; never assume a prior successful upload or overwrite concurrent edits.
The current tool returns planning/proposal receipts only, not execution receipts.

## Evidence and incomplete acceptance

Read-only dry run of the supplied `full-local.json` and this worktree's `public/`:
113 posts, 34 image references (20 native, 14 HTML), 32 available unique local
images, two accepted gaps, no remote/managed references, no duplicate byte groups
or unresolved references. No current library snapshot was supplied. Separately,
all 18 recovered public images matched their recovery manifests' SHA-256s.
These are historical-source counts, **not live CMS reconciliation**.

Automated tests cover the CLI, local byte/metadata inspection, the installed
EmDash hash API, native/gallery/HTML inventory, ambiguity, pending/failed reuse
blocks, duplicate detection, accepted gaps, exact attribute preservation,
publication-state preservation, stale-input rejection, and proposal reruns.

Still blocked on approval and an isolated CMS fixture:

- Actual storage import, media-library deduplication/reuse, and reference updates.
- Native editor save/reopen and raw HTML persistence through the editor.
- Rendered article requests and successful managed-image retrieval.
- Live image/reference count reconciliation, atomic concurrent-edit protection,
  resumable execution receipts, unchanged publication states, and anonymous draft
  privacy checks after actual writes.

Keep static originals and recovery archives throughout verification. Do not infer
that unit tests prove editor behavior, draft privacy, or an import that never ran.
