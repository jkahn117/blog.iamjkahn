# Oxc and Prettier hybrid plan

## Goal

Use Oxfmt and Oxlint as the primary formatter and linter while retaining Prettier only for Astro files. Preserve double quotes and two-space indentation.

## Tasks

1. Add Oxc dependencies and commands.
   - Add `oxfmt` and `oxlint` as development dependencies.
   - Add `format`, `format:check`, `lint`, and `lint:fix` package scripts.
   - Keep the existing `create` script path fix intact.

2. Configure Oxfmt.
   - Add `.oxfmtrc.json` with its local schema.
   - Set spaces, two-space indentation, double quotes, semicolons, trailing commas, LF endings, final newlines, and the existing 80-column width.
   - Enable built-in import sorting.
   - Enable Tailwind v4 sorting with `src/css/tailwind.css` and `clsx`.
   - Ignore `worker-configuration.d.ts`.
   - Disable automatic `package.json` field sorting to avoid unrelated changes.

3. Configure Oxlint.
   - Add `.oxlintrc.json` with its local schema.
   - Use the default correctness-focused rules.
   - Configure the Astro, browser, Node, and Worker environments used by the project.
   - Ignore generated Worker types and build output.
   - Fail the lint command on warnings.
   - Do not add type-aware linting yet.

4. Narrow Prettier to Astro files.
   - Retain `prettier`, `prettier-plugin-astro`, and `prettier-plugin-tailwindcss`.
   - Remove `@trivago/prettier-plugin-sort-imports` because Oxfmt will sort imports in supported files.
   - Remove non-Astro responsibility from `.prettierrc.json` while preserving double quotes, two-space indentation, Astro parsing, and Tailwind class sorting.
   - Remove `.prettierignore`; package scripts will pass only Astro globs to Prettier, while Oxfmt owns the generated-file ignore.

5. Remove EditorConfig.
   - Delete `.editorconfig` after moving its applicable formatting settings into Oxfmt and Prettier configuration.
   - Preserve Markdown wrapping behavior through Oxfmt's `proseWrap: "preserve"` setting.

6. Update editor integration and documentation.
   - Use the Oxc VS Code extension as the default formatter.
   - Keep the Prettier VS Code extension as the formatter for Astro files only.
   - Add both extensions to `.vscode/extensions.json` recommendations.
   - Update `CLAUDE.md` and README commands and formatting notes.

7. Validate the migration.
   - Run Oxfmt and inspect its changes, especially import ordering and Markdown output.
   - Run Prettier against Astro files and inspect template and Tailwind class changes.
   - Run Oxlint and adjust only false positives or project-specific environment issues.
   - Run `pnpm format:check`, `pnpm lint`, and `pnpm build`.
   - Do not modify unrelated untracked blog drafts.

## Expected result

- Oxfmt formats JavaScript, TypeScript, React, JSON, JSONC, CSS, Markdown, YAML, and other supported files.
- Prettier formats only `.astro` files.
- Oxlint checks JavaScript, TypeScript, React, and Astro script blocks.
- Editors use Oxc by default and Prettier only for Astro.
- Formatting uses double quotes and two spaces without `.editorconfig`.
