# Oxc tooling research

## Request

Replace EditorConfig and Prettier with Oxfmt and Oxlint. Keep double quotes and two-space indentation.

## Current setup

- `.editorconfig` defines LF line endings, final newlines, trailing whitespace behavior, spaces, two-space indentation, and double quotes.
- `.prettierrc.json` uses double quotes, two-space indentation, semicolons, trailing commas, import sorting, Astro formatting, and Tailwind class sorting.
- `.prettierignore` excludes `worker-configuration.d.ts`.
- `.vscode/settings.json` uses the Prettier extension as the default formatter.
- `CLAUDE.md` tells contributors to run Prettier and documents its plugins.
- The repository has 28 `.astro` files, 8 `.ts` files, 2 `.mjs` files, 1 `.tsx` file, 1 `.css` file, and 113 Markdown files.
- There is no current linter or lint script.

## Oxfmt findings

The current npm release is `oxfmt@0.66.0`.

Oxfmt can replace these parts of the current setup:

- JavaScript, TypeScript, JSX, TSX, JSON, JSONC, YAML, TOML, CSS, and Markdown formatting
- Double quotes with `singleQuote: false` and `jsxSingleQuote: false`
- Two-space indentation with `useTabs: false` and `tabWidth: 2`
- LF line endings and final newlines with `endOfLine: "lf"` and `insertFinalNewline: true`
- Import sorting with the built-in `sortImports` option
- Tailwind v4 class sorting with built-in `sortTailwindcss`, including the existing stylesheet and `clsx` settings
- Ignoring the generated Worker types through `ignorePatterns`

The migration command preserves Prettier's implicit 80-column width, disables Oxfmt's default `package.json` sorting, migrates Tailwind settings, and copies `.prettierignore` into `ignorePatterns`. It cannot migrate the Astro plugin, import-sorting plugin, or file overrides.

### Astro blocker

Oxfmt 0.66.0 does not format `.astro` files. Running it against an Astro component exits with `Expected at least one target file` because the file type is unsupported. Oxfmt does not support third-party Prettier plugins.

Oxc issue [#19715](https://github.com/oxc-project/oxc/issues/19715) tracks bundled Astro formatter support. It remains open, and its status lists Astro as unfinished.

This matters here because 28 source files are Astro components or pages. A complete Prettier removal would leave them without a formatter.

## Oxlint findings

The current npm release is `oxlint@1.81.0`.

- Oxlint supports JavaScript, TypeScript, JSX, TSX, and script blocks in `.astro` files.
- Its default correctness rules pass the current `src` tree with warnings denied.
- It has native TypeScript, React, import, JSX accessibility, and other plugin rule sets if stricter checks are wanted later.
- The `astro` environment is available for Astro globals.
- Type-aware linting needs the separate `oxlint-tsgolint` package. It is not necessary for an initial migration.
- The official `oxc.oxc-vscode` extension provides both formatting and lint diagnostics. It can replace the Prettier VS Code extension for supported files.

## Proposed configuration

For Oxfmt:

- Explicitly set double quotes and two-space space indentation instead of relying on EditorConfig.
- Preserve the existing 80-column width to avoid unrelated churn.
- Keep semicolons and trailing commas.
- Enable built-in import and Tailwind sorting.
- Ignore `worker-configuration.d.ts`.
- Add `format` and `format:check` scripts.

For Oxlint:

- Start with default correctness checks and the Astro, browser, Node, and Worker environments required by this mixed project.
- Add `lint` and `lint:fix` scripts.
- Treat warnings as failures in the check command.
- Avoid type-aware linting in the first pass.

Other updates:

- Replace the VS Code formatter with `oxc.oxc-vscode` and recommend that extension.
- Remove `.editorconfig`, `.prettierrc.json`, and `.prettierignore` after their useful settings move into Oxfmt config.
- Remove Prettier and all three Prettier plugins from `devDependencies`.
- Update `CLAUDE.md` and README command documentation.
- Run formatting only after reviewing its diff, since import sorting may differ from the Trivago plugin.

## Biome follow-up

The current npm release is `@biomejs/biome@2.5.12`. Biome has Astro parsing, formatting, and linting, but the project still labels all three as experimental. Full support requires `html.experimentalFullSupportEnabled: true`, and Astro formatting must also be enabled explicitly.

A dry run against this repository's Astro components parsed all 23 component files tested. The formatter proposed changes to 10 files, including template expression layout, inline script indentation, tag wrapping, and text wrapping.

Biome would provide one dependency and one editor extension for formatting and linting. It also supports double quotes and two-space indentation. There are two important gaps:

- Markdown formatting is still in progress. This repository contains 113 Markdown posts, so Biome would leave most files unformatted.
- Astro support has open formatter and lint issues. Current reports include incomplete formatting inside template expressions, an LSP bug that can delete Astro frontmatter or HTML in multi-project workspaces, false-positive lint rules, and Tailwind class sorting fixes that do not apply inside Astro expressions.

Biome's recommended linter also reports existing SVG, CSS, accessibility, and Astro findings. These can be configured, but adopting it would require a deliberate baseline rather than turning every recommended rule on immediately.

Biome is worth revisiting after Astro formatting becomes stable and Markdown support lands. It does not currently remove the need for compromises. It trades the hybrid setup's extra dependency for experimental Astro behavior and no Markdown formatter.

## Decision needed

There are three practical paths:

1. **Full Oxc migration now.** Remove Prettier and accept that `.astro` files will not be formatted until Oxfmt adds Astro support.
2. **Hybrid migration.** Use Oxfmt and Oxlint for supported files, but retain Prettier plus `prettier-plugin-astro` only for `.astro` files. This keeps formatting coverage but does not fully satisfy the request to move away from Prettier.
3. **Biome migration.** Use one tool for code and Astro files, accept experimental Astro support, and leave Markdown unformatted.

I still recommend the hybrid path. It keeps the stable Astro formatter and preserves Markdown and Tailwind formatting. Once Oxfmt adds Astro support, removing the remaining Prettier dependency should be small.

## Sources

- [Oxfmt overview](https://oxc.rs/docs/guide/usage/formatter.html)
- [Migrate from Prettier](https://oxc.rs/docs/guide/usage/formatter/migrate-from-prettier.html)
- [Oxfmt language support](https://oxc.rs/docs/guide/usage/formatter/language-support.html)
- [Oxfmt configuration reference](https://oxc.rs/docs/guide/usage/formatter/config-file-reference.html)
- [Oxfmt sorting](https://oxc.rs/docs/guide/usage/formatter/sorting.html)
- [Oxlint overview](https://oxc.rs/docs/guide/usage/linter.html)
- [Oxlint configuration reference](https://oxc.rs/docs/guide/usage/linter/config-file-reference.html)
- [Oxc Astro formatter issue #19715](https://github.com/oxc-project/oxc/issues/19715)
- [Biome language support](https://biomejs.dev/internals/language-support/)
- [Biome configuration reference](https://biomejs.dev/reference/configuration/)
- [Biome Markdown support issue #3718](https://github.com/biomejs/biome/issues/3718)
- [Biome Astro formatter issues](https://github.com/biomejs/biome/issues?q=is%3Aissue%20state%3Aopen%20Astro%20formatter)
