# Manual GUI Acceptance Checklist (owner-executed, installed Chrome)

Automated coverage cannot press the real toolbar. Execute this checklist on
a machine with the production build loaded unpacked
(`pnpm build:chrome` → `chrome://extensions` → Developer mode → Load
unpacked → `apps/extension/.output/chrome-mv3`). Record PASS/FAIL/NOT TESTED
per item. Items marked ⚙ are covered by automated tests but worth a human
sanity pass.

## A. Single-page audit

1. ⚙ Open a normal https page → click the Vittix toolbar icon → popup shows
   the page host and "Analyze Current Page".
2. ⚙ Click Analyze → spinner → summary with preliminary score ring and
   error/warning/info/pass counts.
3. NOT TESTED (human): toolbar icon renders the brand mark; badge shows the
   score after an audit.
4. ⚙ Open Dashboard from the popup → Overview renders the same audit.
5. ⚙ Navigate Metadata/Headings/Images/Links → extracted data matches the
   page you audited.
6. ⚙ Findings section → search, category filter, severity filter, group-by
   toggle work; each error/warning shows evidence and a "How to fix" hint.
7. NOT TESTED (human): visual quality of score ring/bars on a wide and a
   narrow window.

## B. Site-audit permission prompt

8. ⚙ Dashboard → Site Audits → disclosure text is shown before anything.
9. NOT TESTED (human): enter a real https origin → Grant → the NATIVE
   Chrome prompt appears naming EXACTLY that origin → accept.
10. ⚙ Consent panel shows scope (page cap, depth, pacing, robots honored).
11. NOT TESTED (human): deny the prompt → clear "Permission was not
    granted" error, no network activity (verify in DevTools → Network).

## C. Start / cancel / resume

12. ⚙ Start → progress bar advances; the "runs while this tab is open"
    notice is shown.
13. NOT TESTED (human): Cancel mid-crawl → loop stops between requests,
    completed pages remain, status 'cancelled'.
14. NOT TESTED (human): close the dashboard tab mid-crawl → reopen →
    session recovered → Resume → pending pages complete (also covered by
    the automated browser-restart test).

## D. Permission revocation during crawling

15. NOT TESTED (human): while crawling, remove the origin permission in
    `chrome://extensions` → audit stops promptly with the red stop-reason
    banner and the permission status shows REVOKED.

## E. Results and comparisons

16. ⚙ Site summary: audited/failed/skipped counts, error/warning totals,
    duplicate title/description groups, missing title/description/canonical,
    noindex warnings, broken-link candidates, orphan analysis (or the
    explicit "not enough evidence" state), score distribution.
17. ⚙ Run the same site twice → comparison line appears with deltas when
    rule-set versions match; incomparable sessions explain why.

## F. Exports

18. ⚙ Single-page: JSON export contains the full snapshot + findings;
    CSV opens in Excel/Sheets with correct quoting.
19. ⚙ Site: site JSON + pages CSV download; open the CSV and confirm NO
    cell is interpreted as a formula (try a page URL or title starting
    with "=" if you craft one).
20. ⚙ History CSV export lists all stored single-page audits.

## G. Data deletion

21. ⚙ Options page → Clear all audit data (two-step) → confirmation state;
    verify DevTools → Application → IndexedDB → vittix-seo is empty.
22. ⚙ Site Audits → Clear site-audit data → siteAudits/sitePages empty.

## H. Browser restart / recovery

23. NOT TESTED (human): close the whole browser mid-audit, reopen → resume
    works (automated: e2e/siterestart.spec.ts).

## I. Unsupported pages & errors

24. ⚙ chrome://, edge://, extension pages, PDFs → friendly "cannot be
    analyzed" error, error code shown, nothing saved.
25. NOT TESTED (human): offline page → clear injection-failure message.
