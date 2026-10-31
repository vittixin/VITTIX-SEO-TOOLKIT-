# Architecture

## Workspace

pnpm workspace with three packages and a strict dependency direction:

```
apps/extension  ──▶  packages/seo-core  ──▶  packages/shared
(Chrome + React)     (pure analysis)        (schemas & types)
```

- **`apps/extension`** — the only package allowed to touch Chrome APIs, React,
  Dexie and the DOM. Built by WXT (Vite 7) into an MV3 extension.
- **`packages/seo-core`** — analyzers, rule engine, scoring, export
  serializers. Pure TypeScript; `lib: ES2022` only (no DOM types), no React,
  no Chrome APIs. Enforced with ESLint `no-restricted-imports` boundary rules.
- **`packages/shared`** — Zod 4 schemas, TypeScript types, constants, message
  contracts. The bottom of the graph: imports nothing from the workspace.

Internal packages export TypeScript source directly (`exports → src/index.ts`);
the app bundler and Vitest compile them. No separate build step, no `dist`.

## Extension entry points (WXT)

| Entry point                 | Role                                                                |
| --------------------------- | ------------------------------------------------------------------- |
| `entrypoints/popup/`        | React panel: analyze button, status, summary score, dashboard link  |
| `entrypoints/dashboard/`    | Full-page React app (unlisted page, extension-only)                 |
| `entrypoints/options/`      | Chrome options page: retention, clear-all-data, privacy information |
| `entrypoints/background.ts` | Event-driven MV3 service worker (see below)                         |

There is **no content script**. Extraction is a one-shot
`chrome.scripting.executeScript` injection performed only after a user click.

## Analysis pipeline

```
User clicks "Analyze Current Page" (popup)
  └─ runtime message → background service worker
       ├─ tabs.query(active, currentWindow)          — no `tabs` permission needed
       ├─ URL guard: http(s) only                    — friendly error otherwise
       ├─ scripting.executeScript(extractPageSnapshot) — self-contained function,
       │                                               runs in the ISOLATED world
       ├─ PageSnapshotSchema.parse (Zod)             — boundary validation
       ├─ analyzeSnapshot(snapshot)                  — @vittix/seo-core
       │    ├─ analyzeMetadata / analyzeHeadings / analyzeImages / analyzeLinks
       │    └─ computeScore(findings)                — deterministic scoring
       ├─ db.audits.add(...)                         — Dexie / IndexedDB
       └─ response {auditId, score, counts} → popup renders summary
```

### Extraction layer (`src/extraction/snapshot-inject.ts`)

`extractPageSnapshot(limits)` is serialized with `func.toString()` and must
therefore be fully self-contained (no module-scope references — enforced by a
Playwright pipeline test that runs the real function inside a real page). It
returns a bounded `PageSnapshot` (schema **v3**): ≤300 headings, ≤500 images,
≤500 links, ≤100 kB text sample, whitelisted meta fields (including all
`twitter:*` tags), all meta-description/canonical/robots values (≤5 each),
hreflang entries (≤10), link accessible names (aria-labelledby → aria-label →
text → img alt → svg title), inline-SVG accessibility stats, JSON-LD blocks
(≤5), and per-collection `omitted` + `hidden` counts. Hidden content
(`[hidden]`, `aria-hidden="true"` ancestors, inline
`display:none`/`visibility:hidden`) is excluded from analysis collections and
counted — stylesheet-driven hiding is a documented limitation. Totals are
preserved even when collections are truncated, and `result.truncated` flags
partial captures. Nothing is fetched, nothing is sent.

### Rule engine (`packages/seo-core/src/analyzers/`)

Six analyzers (metadata/technical/social, hreflang, headings, images, links,
structured data), each a pure function `PageSnapshot → Finding[]`. A finding
carries `ruleId`, `category`, `severity` (error/warn/info/pass), `title`,
`detail`, optional `evidence` and — on every actionable finding —
`remediation` (a concrete fix hint). 34 rules are documented in
[SEO_RULES.md](SEO_RULES.md) and versioned (`ruleSetVersion` stored with every
audit).

### Scoring engine (`packages/seo-core/src/scoring.ts`)

Category-weighted, severity-penalty-based, floored at 0 per category; only
`error`/`warn` deduct and findings sharing a ruleId are deduplicated so one
issue never incurs a double penalty — see [SEO_RULES.md](SEO_RULES.md#scoring).
Output is typed `preliminary: true` so the UI cannot forget the label.

### Storage layer (`src/storage/`)

Dexie database `vittix-seo` (schema v1): tables `audits` (`++id, url,
analyzedAt`) and `settings` (`key`). Retention (age + count cap) is applied on
install, startup, and after each analysis. All data stays in the extension's
own IndexedDB origin.

### Export engine

- `seo-core`: `auditToJson` (full audit, format-tagged) and `findingsToCsv`
  (RFC 4180, CRLF, quoting/escaping) — pure and unit-tested
- `extension`: Blob URL + anchor download from a user gesture (no `downloads`
  permission required)

## Messaging (`packages/shared/src/messages.ts`)

Single request type `vittix/analyze-active-tab`; discriminated-union response
validated with Zod at the client boundary. Every failure path has a stable
error code and a friendly message in `FRIENDLY_ERROR_MESSAGES`.

## Key technology decisions

- **WXT 0.21.5** over raw webpack/vite config: file-based entry points and a
  generated, audited manifest
- **Vite 7.3.7** (WXT peer range) with a workspace override pinning
  `@vitejs/plugin-react` to **5.1.4**, because plugin-react 6.x targets Vite 8
  and imports `vite/internal`, which does not exist in Vite 7
- **Tailwind CSS 4.3.3** via `@tailwindcss/vite` in WXT's `vite()` hook;
  one shared CSS entry imported by every page
- **TypeScript 5.9.3** strict (+`noUncheckedIndexedAccess`); TS 6/7 deliberately
  deferred
- **React 19.3.1**, **Zod 4.6.7**, **Dexie 4.4.7**, **lucide-react 1.65.0**,
  **Vitest 5.0.5**, **Playwright 1.64.1** — all pinned exactly
- Extension tsconfig extends WXT's generated `.wxt/tsconfig.json` (alias `@` →
  project root, typed `browser` API, typed `runtime.getURL` public paths)

## Build & verification

`pnpm build:chrome` emits `apps/extension/.output/chrome-mv3`. CI and
`pnpm verify:manifest` assert the production manifest keeps the approved
privacy posture: exactly `["activeTab","scripting"]`, no host permissions, no
content scripts, no web-accessible resources, MV3-default CSP.
