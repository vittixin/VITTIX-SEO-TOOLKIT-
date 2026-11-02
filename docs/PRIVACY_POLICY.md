# Privacy Policy — Vittix SEO Toolkit

**Effective date: 2026-11-02.** This file is self-contained and may be hosted
as a standalone Markdown page. It describes the behavior of the Chrome
extension; it is not hosted at a public URL yet.

Vittix SEO Toolkit is a local SEO analysis extension. The developer does not
collect or receive user data. There are no accounts, analytics, telemetry,
advertising, or remote code.

## Data the extension reads and stores

Only after the user starts an audit, the extension reads a bounded snapshot of
the current page: title and metadata, headings, image URLs and alt text, links,
structured data, and bounded visible body text. A small visible lead excerpt
(up to 100 words and 800 characters) is stored locally for keyword prominence.
The extension also stores audit results, optional target keywords, site-audit
page/response/sitemap/link/duplicate metadata, settings, and optional export
branding. These values remain in the extension's local IndexedDB/settings on
that device. Nothing is synced or uploaded.

The extension does not read form values, passwords, cookies, credentials,
iframes, browsing history, or other tabs. It does not read pages when tabs
change or when the side panel opens.

## Network behavior

Single-page audits do not make network requests. Site audits are optional and
start only after the user approves a site origin and accepts the displayed
redirect-risk disclosure. Site audit uses paced, credential-free GET requests,
checks robots.txt, and applies page and response size limits.

A redirect on an audited site may cause the browser to send one credential-free GET request to the redirect destination before the extension can check its origin, permission, or robots rules. A redirect chain may cause one such request per hop. The extension discards a destination response body when its final URL is outside the approved origin or disallowed by robots.txt; it does not analyze or enqueue that page. On localhost or 127.0.0.1, the optional host permission covers every port on that host because Chrome match patterns ignore ports. A redirect from an audited development origin may send a request to another local service before the extension can check it.

Site audits support HTTPS and the development origins `http://localhost` and
`http://127.0.0.1`. Chrome's localhost host patterns cover every port on those
hosts. No site host access is granted at install time. The user approves each
origin when starting a site audit and can revoke it in Chrome settings.

## Exports

JSON, CSV, HTML, and Markdown files are generated locally and downloaded only
after the user chooses an export. The export dialog controls previews, content
statistics, ignored rules, and branding. Page text excerpts and target
keywords are excluded by default from JSON, HTML, and Markdown; the user must
explicitly opt in to include them. CSV never includes page excerpts or target
keywords. CSV fields are protected against spreadsheet formula injection.
HTML reports escape page-derived text and contain no external resources or
executable scripts. Optional agency name, validated accent color, and accepted
PNG/JPEG/WebP logo are included only when the user enables branding for that
export. SVG logos are rejected. Exported files are outside the extension's
local storage once downloaded and are controlled by the user.

## Permissions

- `activeTab` grants temporary current-tab access after a toolbar click or the
  `Ctrl+Shift+U` / `Command+Shift+U` shortcut.
- `scripting` runs the one-shot extractor after the user starts analysis and
  the highlight function after the user clicks Show on page.
- Optional host patterns are `https://*/*`, `http://localhost/*`, and
  `http://127.0.0.1/*`. They are requested for the chosen site only when a site
  audit starts; localhost patterns cover every port.
- Optional `sidePanel` is requested only when the user clicks Enable side
  panel. The panel displays stored results only and cannot initiate page
  analysis or access the active page.

Vittix does not scan in the background, run scheduled audits, bypass logins,
send reports to a service, or request broad install-time host access.

## Retention and deletion

Audit retention can be configured in Settings. Clear all data removes stored
audits, site pages, keywords, origin rule settings, and branding images while
retaining the selected history preferences. Retention pruning also removes
associated stored excerpts/keywords and logo image data when their records are
removed. Uninstalling Vittix removes its extension-local database and settings
from that Chrome profile.

## Contact

**Contact method (replace before publication): [ADD A PUBLIC PRIVACY CONTACT EMAIL OR URL].**
