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

A redirect on the audited site may cause the browser to send one credential-free GET request to the redirect destination before the extension can check its origin, permission, or robots rules. A redirect chain may cause one such request per hop. The extension discards a destination response body when its final URL is outside the approved origin or disallowed by robots.txt; it does not analyze or enqueue that page.

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
  (~257 kB, 18 files incl. THIRD_PARTY_NOTICES.md).
- Acceptance screenshots (`docs/acceptance-evidence/`): kept in the repo for
  now; if repo size becomes a concern, move them to GitHub release assets
  for the corresponding release tag and reference the asset URLs here.

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

## 8. License compliance of bundled code (verified 2026-10-31)

| Bundled package          | License        | Obligation                                                     |
| ------------------------ | -------------- | -------------------------------------------------------------- |
| react / react-dom 19.3.1 | MIT            | Keep notice                                                    |
| zod 4.6.7                | MIT            | Keep notice                                                    |
| dexie 4.4.7              | **Apache-2.0** | Include Apache-2.0 notice text in distributed source/reference |
| lucide-react 1.65.0      | ISC            | Keep notice                                                    |

All are permissive; the repository's MIT license file must be accompanied by
the third-party notices above before public distribution. Action logged for
the first public release: add a `THIRD_PARTY_NOTICES.md`.

## 9. Package verification (Phase 6)

- ZIP: `apps/extension/.output/vittix-seo-toolkit-0.1.0-chrome.zip`
- SHA-256: `32ebda484aa67f78d4eab31de430f1d536be5928c6d1a3ac147190f403a32322`
- 17 files; packaging script refuses source maps / dev files / wrong permissions
