# Chrome Web Store Release Checklist

Status: **prepared, not published** — nothing has been uploaded and no
developer account exists. This checklist must be re-verified after any
dependency or manifest change.

## 1. Manifest & platform compliance

| Item                                                            | Status                                               | Evidence                                             |
| --------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| Manifest V3                                                     | ✅                                                   | `manifest_version: 3` (CI-verified)                  |
| Permissions                                                     | ✅ exactly `activeTab`, `scripting`                  | `pnpm verify:manifest` fails otherwise               |
| `optional_host_permissions`                                     | ✅ catalog only: `https://*/*`                       | CI-verified single entry; nothing granted at install |
| `host_permissions` / content scripts / web_accessible_resources | ✅ absent                                            | CI-verified                                          |
| CSP                                                             | ✅ MV3 default (no `unsafe-eval`, no remote sources) | CI-verified                                          |
| `minimum_chrome_version`                                        | 111 (Tailwind 4 baseline)                            | manifest                                             |
| Service worker (no persistent background page)                  | ✅                                                   | WXT-generated MV3                                    |

## 2. Permission justifications (for the store submission form)

- **`activeTab`** — "Reads the page you are looking at only after you click
  'Analyze Current Page'; access is temporary and revoked on navigation."
- **`scripting`** — "Runs the one-shot, read-only SEO extractor in the tab
  you invoked the extension on. No persistent scripts are ever installed."
- **Host permission usage (single-page mode)** — none. The extension makes
  zero network requests and reads only the active tab on click.
- **Host permission usage (site-audit mode)** — strictly opt-in: one exact
  origin requested at runtime via the standard permission prompt, GET
  requests with credentials stripped, robots.txt honored, revocable. See
  docs/SITE_AUDIT.md for the full threat model.

## 3. Privacy-policy consistency

- docs/PRIVACY.md states: single-page mode = zero network; site mode =
  disclosed, origin-scoped network activity, local-only storage, no
  telemetry. This matches the reviewed bundle (only network-capable API in
  the bundle is React DOM's internal preload helper — never exercised).
- Single-purpose declaration: "SEO auditing of web pages."
- Data-usage disclosures (store form): does not collect personal data;
  stores user activity locally (audit history); no data sold; no data
  transferred for advertising.

## 4. Branding & UX

- Icons 16/32/48/96/128 present in the build (deterministic generator:
  `pnpm icons`).
- Name/short_name/description set in the manifest; description matches the
  store listing below.
- Accessibility: aria labels on interactive controls, alert/status roles on
  error and progress states, keyboard-reachable navigation buttons.

## 5. Build hygiene

- Source maps: **none** in the build output (packaging script fails if a
  `.map` appears).
- Dev-only files: none (packaging script forbids `.ts`, dotfiles,
  test artifacts).
- Production ZIP: `pnpm zip` →
  `apps/extension/.output/vittix-seo-toolkit-<version>-chrome.zip`
  (~251 kB, 17 files — see release report for the exact listing).

## 6. Versioning & release notes

- Version: `0.1.0` (manifest). Bump with each store submission.
- Release notes template: keep to user-visible changes; reference
  docs/ROADMAP.md phase summaries.

## 7. Pre-submission gates (all must pass)

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build:chrome && \
pnpm verify:manifest && pnpm test:e2e && pnpm zip
```

Plus: `pnpm audit` clean for production dependencies; manual acceptance
checklist (docs/MANUAL_ACCEPTANCE.md) executed on installed Chrome.
