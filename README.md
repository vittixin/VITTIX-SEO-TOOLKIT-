# Vittix SEO Toolkit

A professional, privacy-first, open-source SEO auditing extension for Chrome.

Vittix analyzes the page you are looking at — metadata, headings, images and
links — **entirely inside your browser**. No account, no cloud, no telemetry:
page content is read only when you click _Analyze Current Page_, and the audit
history lives in local IndexedDB until you delete or export it.

> **Scores are preliminary.** The rule set is young and clearly labeled as a
> work in progress. Scores describe on-page hygiene, not search rankings.

## Features (Phase 0)

- **One-click audit** from the toolbar popup (user-triggered, `activeTab`)
- **Metadata analyzer** — title, description, canonical, viewport, lang, HTTPS, Open Graph
- **Heading analyzer** — single-h1 and outline-order checks
- **Image analyzer** — alt-text coverage
- **Link analyzer** — internal/external profile, empty anchors, nofollow
- **Preliminary scoring engine** — deterministic, documented, explainable
- **Local audit history** — IndexedDB via Dexie, with retention controls
- **Export** — full audit as JSON, findings as RFC 4180 CSV
- **Dashboard & options pages** — React + Tailwind CSS 4, responsive

## Install (developer mode)

```bash
pnpm install          # workspace + lockfile
pnpm build:chrome     # production build → apps/extension/.output/chrome-mv3
```

Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load
unpacked** → select `apps/extension/.output/chrome-mv3`.

## Commands

| Command                | Purpose                                       |
| ---------------------- | --------------------------------------------- |
| `pnpm dev`             | WXT dev server with hot reload (opens Chrome) |
| `pnpm build`           | Production build (all workspaces)             |
| `pnpm build:chrome`    | Production Chrome MV3 build                   |
| `pnpm lint`            | ESLint + Prettier check                       |
| `pnpm typecheck`       | Strict TypeScript checks for all workspaces   |
| `pnpm test`            | Vitest unit tests                             |
| `pnpm test:watch`      | Vitest in watch mode                          |
| `pnpm test:e2e`        | Build + Playwright extension tests            |
| `pnpm verify:manifest` | Assert manifest permissions/privacy posture   |
| `pnpm icons`           | Regenerate extension icons                    |
| `pnpm clean`           | Remove build output                           |

First run of `pnpm test:e2e` needs `npx playwright install chromium`.

## Repository layout

```
apps/extension/    Chrome extension (WXT, React, Tailwind CSS 4)
packages/shared/   Zod schemas, types, constants (no DOM, no React)
packages/seo-core/ Analyzers, rules, scoring, serializers (pure TypeScript)
docs/              Product, architecture, rules, security, privacy, testing
e2e/               Playwright extension tests
scripts/           Manifest verification, icon generation
```

Dependency direction: `extension → seo-core → shared`. The analysis packages
are provably free of React and Chrome APIs (enforced by ESLint boundary rules).

## Privacy in one paragraph

The extension requests only `activeTab` and `scripting`. It loads no content
scripts, has no host permissions, makes **zero network requests**, and stores
everything locally. You can wipe all data from the options page at any time.
See [docs/PRIVACY.md](docs/PRIVACY.md) and
[docs/SECURITY.md](docs/SECURITY.md).

## License

[MIT](LICENSE) © Vittix SEO Toolkit Contributors
