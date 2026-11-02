# Chrome Web Store listing pack (not submitted)

## Name

Vittix SEO Toolkit

## Short description (85 / 132 characters)

Private, local SEO audits for page metadata, content, links, images, and site health.

## Single-purpose statement

Vittix helps a user inspect on-page SEO signals and site health, then review
actionable findings locally in Chrome.

## Long description

Vittix SEO Toolkit analyzes the page you choose and presents clear SEO findings
with remediation guidance. Analysis and storage stay on your device.

**Single-page audit**

- Start from the toolbar button or Ctrl+Shift+U.
- Review metadata, headings, images, links, structured data, content, and
  social previews.
- See a preliminary score with a score cap explanation and rule details.
- Keep local history, compare compatible audits, and highlight selected page
  elements on demand.
- Optionally enable a side panel to view the latest saved audit; opening it
  does not read the active page.
- Export JSON, CSV, HTML, or Markdown reports. Excerpts and target keywords
  are excluded by default and require an explicit export option.

**Optional site audit**

- Audit one origin with a user-approved runtime permission and a maximum
  50-page crawl.
- Review response metadata, sitemap coverage, duplicates, and internal links.
- Site audit sends paced credential-free GET requests and honors robots.txt.
  It is never started automatically.
- Before the crawl, the user must accept the redirect disclosure. A followed
  redirect can cause a credential-free request to its destination before
  Vittix can inspect that destination; the response body is discarded when
  the destination is outside the approved origin or disallowed by robots.
- HTTPS is supported. Local development audits also support localhost and
  127.0.0.1; the optional permission covers every port on that host.

A redirect on an audited site may cause the browser to send one credential-free GET request to the redirect destination before the extension can check its origin, permission, or robots rules. A redirect chain may cause one such request per hop. The extension discards a destination response body when its final URL is outside the approved origin or disallowed by robots.txt; it does not analyze or enqueue that page. On localhost or 127.0.0.1, the optional host permission covers every port on that host because Chrome match patterns ignore ports. A redirect from an audited development origin may send a request to another local service before the extension can check it.

**Privacy**

- The developer collects no user data. No accounts, analytics, telemetry,
  advertising, remote code, or remote resources.
- Single-page audits make no network requests. Site audits make only the
  user-approved, disclosed requests described above.
- Audit data, target keywords, excerpts, settings, and optional branding are
  stored locally. They are not uploaded or synced.
- Downloaded report files are created locally and remain under the user's
  control.

Scores describe on-page checks and preliminary heuristics. They are not
ranking predictions.

## Chrome Web Store privacy tab answers

- **Does the extension collect user data?** No. The developer does not collect
  or receive data.
- **What is stored locally?** User-started page/site audit snapshots and
  findings, optional target keywords, the bounded lead excerpt, local history,
  profile/rule settings, theme/preferences, and optional export branding.
- **Is data sold or used for advertising?** No. Data is not sold, transferred,
  or used for advertising.
- **Is remote code used?** No. The extension contains no remotely hosted code.
- **Privacy policy:** use the hosted standalone contents of
  `docs/PRIVACY_POLICY.md` after hosting is arranged. Do not submit while the
  policy URL is not publicly reachable.

## Screenshots to capture (1280 × 800)

The production-build captures saved in `docs/store-assets/` are:

1. `01-dashboard-overview.png` — latest audit score and summary.
2. `02-previews.png` — Google and social preview estimates.
3. `03-content.png` — content metrics and keyword table.
4. `04-site-audit.png` — opt-in site audit controls and scope.
5. `05-export.png` — local export formats and privacy options.

These are prepared artifacts; store submission remains a manual decision.
