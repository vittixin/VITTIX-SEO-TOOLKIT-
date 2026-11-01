# Chrome Web Store permission explanations

Vittix SEO Toolkit performs user-started analysis in the browser. The install
manifest grants only `activeTab` and `scripting`; site-audit host patterns and
`sidePanel` are optional and requested only from their feature flows.

## Install-time permissions

### `activeTab`

Chrome grants temporary access to the tab only after the user invokes the
toolbar action or the `Ctrl+Shift+U` / `Command+Shift+U` keyboard command. The
extension reads the visible page to create an SEO snapshot and stores the
result locally. The popup itself does not start analysis until the user clicks
Analyze. This permission does not provide general browsing history access or
persistent access to every tab.

### `scripting`

The extension uses `chrome.scripting` for a one-shot extractor after the user
starts a single-page audit, and for the bounded, user-clicked Show on page
highlight action. The injected functions are self-contained. Vittix does not
install a content script, watch page changes, or collect additional content in
the background.

## Optional permissions

### HTTPS, localhost, and 127.0.0.1 host patterns

The optional host catalog is exactly `https://*/*`, `http://localhost/*`, and
`http://127.0.0.1/*`. No host access is granted at install time. When the user
opens Site Audit, enters a site, and clicks Start, Chrome asks for access to
that specific origin. The user can decline or revoke access in Chrome settings.
The loopback patterns cover every port on localhost or 127.0.0.1 because Chrome
match patterns do not include ports. The extension fetches pages only after
site-audit consent, an origin permission check, robots checks, and crawl pacing.

The consent text is the canonical statement in
`SITE_REDIRECT_DISCLOSURE` in `packages/shared/src/site.ts`:

> A redirect on an audited site may cause the browser to send one credential-free GET request to the redirect destination before the extension can check its origin, permission, or robots rules. A redirect chain may cause one such request per hop. The extension discards a destination response body when its final URL is outside the approved origin or disallowed by robots.txt; it does not analyze or enqueue that page. On localhost or 127.0.0.1, the optional host permission covers every port on that host because Chrome match patterns ignore ports. A redirect from an audited development origin may send a request to another local service before the extension can check it.

### `sidePanel`

The optional `sidePanel` API permission is requested only when the user clicks
**Enable side panel (optional)** in the popup. Declining leaves the popup and
dashboard available. The panel reads the latest saved audit from local
IndexedDB and refreshes when the extension reports that a user-started audit
was saved. It cannot grant `activeTab`, trigger a page analysis, or read the
active page by itself.

## What Vittix does not do

- It does not collect or transmit user or page data to a server.
- It does not run scheduled, automatic, or background page audits.
- It does not read page content when a tab changes or when the side panel opens.
- It does not use remote code, remote images, analytics, or telemetry.
- It does not sell data or build advertising profiles.
- It does not request broad install-time website access.

See [PRIVACY.md](PRIVACY.md), [PRIVACY_POLICY.md](PRIVACY_POLICY.md), and
[SECURITY.md](SECURITY.md) for the complete data and security details.
