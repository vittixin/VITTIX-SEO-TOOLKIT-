# Security

## Permission posture (production manifest)

The extension requests **exactly**:

- `activeTab` — temporary access to the current tab, granted when the user
  clicks the toolbar action or invokes the keyboard command; Chrome withholds
  access after a cross-origin navigation. A side-panel click does not grant it.
- `scripting` — required to run the one-shot extraction function in that tab

Explicitly **not** requested: `tabs`, `history`, `downloads`, `storage`,
`clipboardWrite`, `unlimitedStorage`, any install-time `host_permissions`,
and any content scripts. Runtime optional host patterns are limited to
`https://*/*`, `http://localhost/*`, and `http://127.0.0.1/*`; the HTTP
patterns support local development only and Chrome ignores ports in these
patterns.
The `sidePanel` permission is optional too and is requested only from the
popup after the user selects Enable side panel; it is not an install-time
grant.

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
- The page-highlight helper is serialized and self-contained, uses only fixed
  selectors and saved ordinals, caps highlights at 50, and uses `textContent`
  for its static overlay message. It does not fetch or transmit data.

## Secrets

- The extension contains no API keys, tokens or credentials (there is no API)
- `.env*` files are git-ignored; CI runs gitleaks secret scanning
- No environment variables are read at runtime

## Data handling

See [PRIVACY.md](PRIVACY.md). Single-page audits make no network requests.
Optional site audits fetch the approved site locally and may contact redirect
destinations before their final URLs can be checked.

A redirect on an audited site may cause the browser to send one credential-free GET request to the redirect destination before the extension can check its origin, permission, or robots rules. A redirect chain may cause one such request per hop. The extension discards a destination response body when its final URL is outside the approved origin or disallowed by robots.txt; it does not analyze or enqueue that page. On localhost or 127.0.0.1, the optional host permission covers every port on that host because Chrome match patterns ignore ports. A redirect from an audited development origin may send a request to another local service before the extension can check it.

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
  `browser.permissions.contains` before every crawler fetch. The final URL is
  checked again after a page fetch; browser-followed intermediate redirect
  hops cannot be checked before their requests (see [SITE_AUDIT.md](SITE_AUDIT.md)).
- **robots.txt redirects**: cross-origin robots redirects block the audit
  (fail closed) instead of being trusted.
