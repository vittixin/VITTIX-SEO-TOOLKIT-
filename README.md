# Vittix SEO Toolkit

A professional, privacy-first, open-source SEO auditing extension for Chrome.

Vittix analyzes the page you are looking at — metadata, headings, images and
links — **entirely inside your browser**. No account, no cloud, no telemetry:
page content is read only when you click _Analyze Current Page_, and the audit
history lives in local IndexedDB until you delete or export it.

> **Scores are preliminary.** The rule set is young and clearly labeled as a
> work in progress. Scores describe on-page hygiene, not search rankings.

## Features

- **One-click audit** from the toolbar popup (user-triggered `activeTab`; keyboard command Ctrl+Shift+U with score badge)
- **Side-panel access note** � a click inside the panel cannot grant `activeTab`; start analysis from the toolbar icon or Ctrl+Shift+U.
- **Metadata analyzer** — title (chars + estimated pixel width), description, canonical, viewport responsiveness, lang format, robots directives, hreflang, Open Graph/Twitter cards
- **Heading analyzer** — single-h1 and outline-order checks
- **Image analyzer** — alt coverage incl. decorative detection and quality heuristics
- **Link analyzer** — internal/external/other buckets (www-aware), accessible names incl. aria-labelledby, generic-anchor quality
- **Content analyzer** — thin-content detection (300-word guidance, partial-sample aware)
- **Structured data** — JSON-LD presence, syntax and @context/@type structure checks
- **Preliminary scoring engine** — deterministic, documented, explainable; blocking issues cap the score and count-based penalties scale with affected ratio
- **Local audit history** — IndexedDB via Dexie, with retention controls
- **Export** — full audit as JSON, findings as RFC 4180 CSV
- **Opt-in site audits** — multi-page audits of one user-approved origin
  (per-origin runtime permission, robots.txt honored, GET-only, no
  credentials; see [docs/SITE_AUDIT.md](docs/SITE_AUDIT.md))
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

The extension requests only `activeTab` and `scripting` at install. Single-page
audits make no network requests; optional site audits request one origin at
runtime and make credential-free GET requests. A redirect may cause the
browser to contact its destination before the extension can inspect it; the
body is discarded when that final destination is outside the approved origin
or disallowed by robots. Results are stored locally. You can wipe all data from
the options page at any time.
A redirect on an audited site may cause the browser to send one credential-free GET request to the redirect destination before the extension can check its origin, permission, or robots rules. A redirect chain may cause one such request per hop. The extension discards a destination response body when its final URL is outside the approved origin or disallowed by robots.txt; it does not analyze or enqueue that page. On localhost or 127.0.0.1, the optional host permission covers every port on that host because Chrome match patterns ignore ports. A redirect from an audited development origin may send a request to another local service before the extension can check it.
See [docs/PRIVACY.md](docs/PRIVACY.md) and
[docs/SECURITY.md](docs/SECURITY.md).

Audits can be exported locally as JSON, CSV, a self-contained printable HTML
report, or a Markdown issue ticket. Report excerpts and target keywords are
excluded by default and can be included per export. Optional agency branding is
stored locally; SVG logos are not accepted.

## Documentation

- [Release readiness & store checklist](docs/RELEASE_CHECKLIST.md)
- [Store listing (prepared)](docs/STORE_LISTING.md)
- [Site-audit threat model](docs/SITE_AUDIT.md)
- [Manual GUI acceptance checklist](docs/MANUAL_ACCEPTANCE.md)

## License

[MIT](LICENSE) © Vittix SEO Toolkit Contributors
