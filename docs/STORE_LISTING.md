# Chrome Web Store Listing (prepared — not published)

## Name

Vittix SEO Toolkit

## Summary (132 chars max)

Privacy-first SEO audits in your browser: metadata, headings, images, links,
structured data and site-wide reports. 100% local analysis.

## Detailed description

Vittix SEO Toolkit audits the page you are looking at — entirely inside your
browser.

SINGLE-PAGE AUDITS (default, zero network)
• One click analyzes the current tab: title, meta description, canonical,
robots directives, viewport, language, hreflang, Open Graph and Twitter
cards
• Heading outline checks (single h1, hierarchy)
• Image alt-text coverage with decorative-image detection
• Link accessibility and internal-link quality
• JSON-LD structured-data syntax checks
• A transparent, preliminary 0–100 score with "how to fix" guidance on
every finding
• Local audit history with retention controls; JSON and CSV export

SITE AUDITS (opt-in, disclosed network use)
• Audit up to 50 pages of ONE origin you explicitly approve
• Standard Chrome permission prompt per origin — revocable anytime
• robots.txt rules checked before crawler requests; GET requests only; no cookies or credentials
• Duplicate titles/descriptions, missing canonicals, noindex warnings,
broken-link candidates and orphan-page analysis across the crawled pages

PRIVACY BY DESIGN
• Single-page mode performs zero network requests — verified in CI
• Site audits request an approved origin at runtime; browser-followed redirects may contact a destination before it can be checked
• No accounts, no telemetry, no analytics, no remote code
• All data stays in your browser's local storage; delete it anytime

A redirect on the audited site may cause the browser to send one credential-free GET request to the redirect destination before the extension can check its origin, permission, or robots rules. A redirect chain may cause one such request per hop. The extension discards a destination response body when its final URL is outside the approved origin or disallowed by robots.txt; it does not analyze or enqueue that page. For localhost or 127.0.0.1 audits, a redirect can reach another local-network service.

Note: scores are clearly labeled preliminary — they describe on-page
hygiene, not search rankings.

## Category

Productivity → Tools (or Developer Tools)

## Language

English (more later)

## Privacy policy URL

To be published (docs/PRIVACY.md content hosted in the repository).

## Single-purpose description

SEO auditing of web pages: analyze on-page SEO signals and report findings
locally.

## Permission justification snippets

(See docs/RELEASE_CHECKLIST.md §2 — activeTab, scripting and the opt-in
host-permission catalog, each with the exact sentences used in the form.)
