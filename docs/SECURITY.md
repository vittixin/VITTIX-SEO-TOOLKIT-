# Security

## Permission posture (production manifest)

The extension requests **exactly**:

- `activeTab` — temporary access to the current tab, granted when the user
  clicks the toolbar action; revoked on navigation
- `scripting` — required to run the one-shot extraction function in that tab

Explicitly **not** requested: `tabs`, `history`, `downloads`, `storage`,
`clipboardWrite`, `unlimitedStorage`, any `host_permissions` (including
`optional_host_permissions`), and any content scripts.

`minimum_chrome_version` is 111 (Tailwind CSS 4 baseline; MV3 itself requires 88+).

This posture is **enforced in CI**: `scripts/verify-manifest.mjs` fails the
build if the generated manifest deviates (unexpected permissions, host
permissions, content scripts, web-accessible resources, or a CSP that allows
`unsafe-eval` or remote sources).

## Remote code

- The MV3 default CSP applies (`script-src 'self'`); the manifest declares no
  custom CSP and loads no remote scripts, styles, or fonts
- `web_accessible_resources` is empty — extension pages cannot be embedded by
  websites
- No `eval`, no dynamic `import()` of remote code, no remote workers

## Injection safety

- The extractor runs in Chrome's **isolated world**: it can read the DOM but
  cannot touch page JavaScript objects, and page scripts cannot see it
- The injected function is bundled and self-contained; it returns plain
  serializable data that is **validated with Zod** before use or persistence
- Injection happens only after a user click, only on `http(s)` URLs; guarded
  before execution with clear user-facing errors for everything else
  (browser-internal pages, extension pages, files, PDF viewer)

## Secrets

- The extension contains no API keys, tokens or credentials (there is no API)
- `.env*` files are git-ignored; CI runs gitleaks secret scanning
- No environment variables are read at runtime

## Data handling

See [PRIVACY.md](PRIVACY.md). In short: everything stays on-device; the
extension makes no network requests of any kind.

## Reporting

Security issues can be reported via GitHub security advisories in the
repository. Please do not open public issues for vulnerabilities.

## Phase 4 additions

- **CSV formula injection**: spreadsheet exports (`findingsToCsv`,
  `historyToCsv`, `sitePagesToCsv`) prefix a single quote before any field
  whose first character could start a formula (`=`, `+`, `-`, `@`, tab,
  CR) per OWASP guidance; RFC 4180 quoting is unchanged.
- **URL credentials rejected**: audit targets containing `user:pass@host`
  are refused (fail closed) so embedded credentials can never leak into
  fetches, logs or exports.
- **Site-mode permission re-verification**: the site-audit crawler re-checks
  `browser.permissions.contains` before every request; revocation cancels
  the audit immediately (see [SITE_AUDIT.md](SITE_AUDIT.md)).
- **robots.txt redirects**: cross-origin robots redirects block the audit
  (fail closed) instead of being trusted.
