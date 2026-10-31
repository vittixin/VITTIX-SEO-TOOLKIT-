# Development

## Prerequisites

- **Node.js ≥ 22.12** (developed on 26.x; CI runs 24 LTS)
- **pnpm 11.21.0** (pinned via `packageManager` in `package.json`)
- Chrome for loading the built extension (dev or manual testing)

## Setup

```bash
git clone <repo> && cd vittix-seo-toolkit
pnpm install          # also runs `wxt prepare` (generates .wxt/ types)
pnpm test             # 74 unit tests
pnpm build:chrome     # production build
```

`pnpm dev` starts the WXT dev server and launches a Chrome instance with the
extension loaded and hot reload.

## Daily workflow

| Task                    | Command                         |
| ----------------------- | ------------------------------- |
| Develop with hot reload | `pnpm dev`                      |
| Type-check everything   | `pnpm typecheck`                |
| Lint + format check     | `pnpm lint`                     |
| Auto-format             | `pnpm format`                   |
| Unit tests              | `pnpm test` / `pnpm test:watch` |
| E2E (needs build)       | `pnpm test:e2e`                 |
| Verify manifest         | `pnpm verify:manifest`          |

## Workspace rules

- Dependency direction: `apps/extension → packages/seo-core → packages/shared`
  — enforced by ESLint `no-restricted-imports`
- `packages/shared` and `packages/seo-core` are **pure TypeScript**: no React,
  no Chrome APIs, no DOM. Keep them that way; they are the reusable core
- Internal packages are consumed as TypeScript source (`exports` →
  `src/index.ts`); there is no build step for them
- In the extension app, imports use the WXT alias `@/src/...` (`@` maps to
  `apps/extension`)
- Strict TS everywhere (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`)

## Conventions

- Formatting: Prettier (single quotes, 100 cols, trailing commas) — run
  `pnpm format` before committing
- Errors in UIs: always render the friendly message from
  `FRIENDLY_ERROR_MESSAGES` (shared), keep raw details for the console
- New SEO rules: add the analyzer + tests in `seo-core`, document the rule in
  `docs/SEO_RULES.md`, bump `RULE_SET_VERSION` if semantics change

## Gotchas learned during Phase 0 (read before upgrading)

- **`@vitejs/plugin-react` must stay on 5.x while Vite is 7.x.** Version 6
  imports `vite/internal` (Vite 8 only). Pinned via a workspace `overrides`
  entry in `pnpm-workspace.yaml`.
- **pnpm 11** uses `allowBuilds` (not `onlyBuiltDependencies`) and a
  `minimumReleaseAge` supply-chain guard; both are configured in
  `pnpm-workspace.yaml`.
- **Playwright extension tests need `channel: 'chromium'`** (full build, new
  headless). Playwright's default headless shell has no extension support,
  and branded Chrome ignores `--load-extension` since Chrome 137.
- The injected extractor (`snapshot-inject.ts`) must stay **self-contained**
  (no module-scope references) because `chrome.scripting` serializes it with
  `func.toString()`. The pipeline e2e test guards this.

## Loading the extension manually

1. `pnpm build:chrome`
2. Open `chrome://extensions`, enable **Developer mode**
3. **Load unpacked** → `apps/extension/.output/chrome-mv3`
4. Open any website, click the Vittix icon, then _Analyze Current Page_
