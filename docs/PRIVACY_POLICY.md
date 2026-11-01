# Privacy Policy — Vittix SEO Toolkit

**Effective date: 2026-10-31. Status: PENDING HOSTING** — this document is
ready for publication but is not yet hosted at a public URL. The Chrome Web
Store listing must reference a real, reachable URL once hosting is arranged
(do not submit with this file's repository path as the policy URL).

Vittix SEO Toolkit ("Vittix", "the extension") is built to work without
collecting your data. This policy explains exactly what the extension does
and does not do, in plain language.

## The short version

- **Single-page audits (the default):** the extension reads the page you
  are looking at only when you click _Analyze Current Page_. The analysis
  happens entirely inside your browser. **No network requests are made** in
  this mode.
- **Site audits (opt-in):** only after you explicitly approve ONE website
  does the extension fetch pages starting from that site. Browser-followed
  redirects may contact a destination before it can be checked.
- **No accounts, no telemetry, no analytics, no advertising.**

## What data is read

When you run an audit, Vittix reads from the page in front of you:

- page title and metadata (description, canonical address, robots
  directives, viewport, language, hreflang entries, Open Graph and
  Twitter/X card tags)
- headings (up to 300) and their text
- images (up to 500): web address and alt text
- links (up to 500): web address, visible text, rel/target attributes and
  the accessible name (aria-label, image alt or SVG title)
- structured-data (JSON-LD) script blocks (up to 5)
- a body-text sample used only to count words

It does **not** read passwords, form inputs, cookies, other tabs or your
browsing history. It does not read content inside iframes.

## What is stored, and where

- Audit results (the data above plus the computed findings) are stored in
  your browser's local IndexedDB storage, on your device only.
- Your settings (history retention, page limits) are stored the same way.
- Nothing is synchronized, uploaded or shared. There is no server.

## What is transmitted

- **Single-page mode: nothing.** The extension makes no network requests in
  this mode. You can verify this in your browser's developer tools.
- **Site-audit mode:** when you start a site audit, Vittix starts GET requests
  at pages of the exact website origin you approved (for example
  `https://example.com/…`) and at that site's `/robots.txt` file. Requests
  omit cookies and credentials, never submit forms, and are paced and limited.
  The browser may follow a page redirect before Vittix can inspect its final
  URL, so a destination can receive the redirect request. See the explicit
  disclosure below. Robots rules are checked before crawler requests and
  against same-origin final URLs before their response bodies are parsed.

A redirect on the audited site may cause the browser to send one credential-free GET request to the redirect destination before the extension can check its origin, permission, or robots rules. A redirect chain may cause one such request per hop. The extension discards a destination response body when its final URL is outside the approved origin or disallowed by robots.txt; it does not analyze or enqueue that page. For localhost or 127.0.0.1 audits, a redirect can reach another local-network service.

## Permissions

- **`activeTab`** — lets Vittix read the current page after you click the
  toolbar icon. Temporary: access ends when you navigate away.
- **`scripting`** — runs the read-only extractor on that page. No
  persistent background scripts are installed.
- **Optional per-site access (site audits)** — nothing is granted at
  install time. When you start a site audit for, say, `https://example.com`,
  Chrome asks whether to give Vittix access to exactly that site. You can
  revoke it at any time in `chrome://extensions` (Details → Permissions),
  and the extension re-checks the grant before every request.

## Site-audit protections

- Only ordinary public `https://` sites can be audited (local, private and
  IP-based addresses are refused).
- Only the approved origin is visited — redirects off that origin are
  recorded but not followed up.
- Authentication, CAPTCHAs and paywalls are never bypassed; pages that
  require login will typically appear as failed requests in the report.

## Deleting your data

- **Delete one audit:** Dashboard → Audit History → trash icon.
- **Delete all single-page audits:** Dashboard → Settings (or the Options
  page) → _Clear all audit data_ → confirm.
- **Delete all site-audit data:** Dashboard → Site Audits → _Clear
  site-audit data_ → confirm.
- **Delete everything:** remove the extension — Chrome deletes its local
  storage with it.

## Contact

This is an open-source project. Issues and questions can be raised through
the project's repository issue tracker.

## Deployment steps (maintainer notes — not part of the public policy)

1. Host this document at a stable public URL (e.g. GitHub Pages:
   repository Settings → Pages, or a `gh-pages` branch serving
   `docs/PRIVACY_POLICY.md`). Suggested final URL shape:
   `https://<org>.github.io/vittix-seo-toolkit/PRIVACY_POLICY.md` — do NOT
   submit until the URL is live and verified reachable.
2. Reference that URL in the Chrome Web Store listing's "Privacy policy"
   field.
3. Re-verify the policy after any permission or data-flow change (release
   checklist §3).
