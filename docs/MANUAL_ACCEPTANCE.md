# Manual acceptance checklist — production build

Run this checklist with a real Chrome profile and the production build only.
Do not load `.output/chrome-mv3-e2e` or use Playwright's fake permission UI for
these checks. The site-audit permission and redirect acknowledgement need real
Chrome prompts and a controlled test origin. Use only test sites you control.

## Prepare

1. Run `pnpm build:chrome` and wait for the production build to finish.
2. Open `chrome://extensions` in a dedicated Chrome profile.
3. Turn on **Developer mode**.
4. Click **Load unpacked**, select `.output/chrome-mv3`, then pin Vittix from
   the Extensions menu.
5. Open the extension's **Details** page. Confirm the installed permissions
   are `activeTab` and `scripting`; confirm no site access is granted yet.
6. Record the Chrome version, OS, extension version, date, and tester below.

## Acceptance steps

### Install and permission baseline

- [ ] In `chrome://extensions`, confirm Vittix is enabled and its details page
      lists the production build version.
- [ ] Confirm **Site access** has no granted origins before starting a site
      audit. The optional catalog must remain optional.
- [ ] Confirm no background permission or broad installed host permission is
      listed.

### Single-page audit and keyboard shortcut

1. Open a normal HTTPS page that you control or a public test page.
2. Click the pinned Vittix toolbar icon.
3. Click **Analyze Current Page** and wait for the preliminary score.
4. Click **Open Dashboard**; confirm the Overview shows the URL, score, score
   cap (if any), and findings.
5. Open another page and press **Ctrl+Shift+U** (Windows/Linux) or
   **Command+Shift+U** (macOS). Confirm a new audit is saved.
6. In the dashboard, open **Audit History** and confirm both audits appear.

### Exports

1. Open Dashboard → **Export** and export JSON, CSV, HTML, and Markdown one at
   a time.
2. In JSON/HTML/Markdown options, leave **include page text excerpt** and
   **include target keyword** unchecked. Open each file and confirm neither is
   present.
3. Check each opt-in separately, export again, and confirm the selected value
   is included only in that file.
4. Confirm CSV opens in a spreadsheet without treating page-provided values as
   formulas. CSV must not include excerpt or target keyword data.
5. Confirm HTML opens offline, has no remote resources, and displays escaped
   text as text.

### Site audit: real permission and redirect acknowledgement

1. Use a controlled HTTPS test origin with robots.txt, several linked pages,
   and one redirect route. Do not use a production site for this test.
2. Open Dashboard → **Site Audit**, enter the origin, and click **Start audit**.
3. Read the redirect-risk text and accept the required acknowledgement.
4. When Chrome displays the host permission prompt, verify the displayed site
   and choose **Allow**. Confirm the crawl starts and results appear.
5. Confirm the audit reports its profile, rule-set version, response headers,
   and completeness/stop reason.
6. Start another controlled audit with enough delayed pages to keep it running.
   Open `chrome://extensions` → Vittix → **Site access** and revoke that
   origin while the crawl is active. Return to the dashboard; confirm the
   crawl stops safely and reports the permission loss without continuing
   requests.
7. Start a controlled site whose linked URL redirects. Confirm the redirect
   acknowledgement appears before the crawl and the destination behavior is
   described exactly as the consent text states.

### Development-origin audit

1. Start a local HTTP server on `127.0.0.1` (or `localhost`) on a test port.
2. In Site Audit, enter that origin and click **Start audit**.
3. Confirm Chrome requests optional host access at runtime. The consent must
   say that localhost permission covers every port and a redirect can reach
   other local services.
4. Accept the prompt and start the crawl. Confirm the UI and report show the
   **Development origin** badge and HTTPS/mixed-content checks use the relaxed
   informational severity.
5. Confirm the selected scoring profile did not change automatically.

### Theme, data deletion, and uninstall

1. Open Settings and select Light, Dark, then System. Navigate to the popup,
   dashboard, options page, and side panel; confirm the selection persists
   without a flash of the wrong theme.
2. Save an audit, target keyword, origin rule setting, and export logo. Open
   Settings → **Clear all data** → confirm. Verify audits, site pages, target
   keywords, origin settings, and logo data are removed; retention/theme
   preferences remain.
3. Open `chrome://extensions`, remove Vittix, and confirm Chrome removes its
   local database and settings from that profile.

## Results table

Fill in every row. A release candidate is not manually accepted until every
required row has a result and any failure has an issue or an explicit release
decision.

| Check                             | Result (Pass/Fail/Blocked) | Date | Chrome / OS | Evidence or issue |
| --------------------------------- | -------------------------- | ---- | ----------- | ----------------- |
| Install and permission baseline   |                            |      |             |                   |
| Single-page toolbar audit         |                            |      |             |                   |
| Keyboard shortcut audit           |                            |      |             |                   |
| Audit history                     |                            |      |             |                   |
| JSON and CSV exports              |                            |      |             |                   |
| HTML and Markdown exports         |                            |      |             |                   |
| Site audit real permission prompt |                            |      |             |                   |
| Mid-crawl permission revocation   |                            |      |             |                   |
| Redirect acknowledgement          |                            |      |             |                   |
| Development-origin audit          |                            |      |             |                   |
| Theme toggle across views         |                            |      |             |                   |
| Clear all data                    |                            |      |             |                   |
| Uninstall behavior                |                            |      |             |                   |

**Tester:** ____________________

**Chrome version:** ____________________

**Operating system:** ____________________

**Production build commit:** ____________________

**Overall decision:** ____________________
