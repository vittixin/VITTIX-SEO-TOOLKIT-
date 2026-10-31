# Codex conversation

## User

You are the lead software architect for Vittix SEO Toolkit.

PROJECT:
Vittix SEO Toolkit
Repository: vittix-seo-toolkit
License: MIT
Platform: Chrome Extension Manifest V3

TECHNOLOGY:
- WXT
- React
- TypeScript strict
- Tailwind CSS 4
- pnpm workspace
- Vitest
- Playwright
- Zod
- Dexie / IndexedDB

PRODUCT:
Professional, privacy-first, open-source SEO Chrome extension.

INITIAL MVP:
1. SEO dashboard
2. Metadata analyzer
3. Heading analyzer
4. Image analyzer
5. Link analyzer
6. SEO scoring engine
7. Local audit history
8. JSON and CSV export

TASK: PHASE 0 PLANNING ONLY.

1. Inspect current directory and Git status.
2. Inspect existing project files.
3. Verify Node.js, pnpm and Codex environment.
4. Verify compatibility of proposed dependencies.
5. Design pnpm workspace.
6. Design WXT Manifest V3 architecture.
7. Define minimum Chrome permissions.
8. Prepare Phase 0 implementation plan.
9. Define build and test commands.
10. Identify risks and dependencies.

STRICT RULES:
- READ ONLY.
- Do not create or modify files.
- Do not install dependencies.
- Do not commit or push.
- Do not start implementation.
- Do not overwrite existing user work.

Return:
- Environment report
- Repository assessment
- Proposed file structure
- Dependency recommendations
- Implementation sequence
- Acceptance criteria
- Risks

Wait for my approval.

## Assistant

I’ll keep this read-only: first inspect the repository and Git state, then check the installed toolchain and validate proposed package compatibility from official sources where version support may have changed.

## Activity

    $ Get-Content -LiteralPath 'C:\Users\Admin\.codex\RTK.md' -ErrorAction Stop; Get-Location; git status --short --branch; rg --files -g '!node_modules' -g '!dist' -g '!build' | Select-Object -First 200; node --version; pnpm --version; codex --version
    # RTK - Rust Token Killer (Codex CLI)
    
    **Usage**: Token-optimized CLI proxy for shell commands.
    
    ## Rule
    
    Always prefix shell commands with `rtk`.
    
    Examples:
    
    ```bash
    rtk git status
    rtk cargo test
    rtk npm run build
    rtk pytest -q
    ```
    
    ## Meta Commands
    
    ```bash
    rtk gain            # Token savings analytics
    rtk gain --history  # Recent command savings history
    rtk proxy <cmd>     # Run raw command without filtering
    ```
    
    ## Verification
    
    ```bash
    rtk --version
    rtk gain
    which rtk
    ```
    
    fatal: not a git repository (or any of the parent directories): .git
    v26.7.0
    11.21.0
    codex-cli 0.165.0
    Path
    ----
    D:\ketan\github\vittix-seo-toolkit
    
    ✓ • 2.19s

## Activity

    $ rtk --version; rtk gain; rtk proxy Get-ChildItem -Force | Format-Table Mode,Length,LastWriteTime,Name -AutoSize; rtk proxy Get-ChildItem -Force .. | Format-Table Mode,Length,LastWriteTime,Name -AutoSize; rtk proxy git status --short --branch; rtk proxy node -e "console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,execPath:process.execPath},null,2))"; rtk proxy pnpm config get store-dir; rtk proxy pnpm config get workspace-dir; rtk proxy where.exe node; rtk proxy where.exe pnpm; rtk proxy where.exe codex
    rtk 0.42.4
    RTK Token Savings (Global Scope)
    ════════════════════════════════════════════════════════════
    
    Total commands:    14103
    Input tokens:      31.9M
    Output tokens:     22.9M
    Tokens saved:      9.0M (28.2%)
    Total exec time:   805m37s (avg 3.4s)
    Efficiency meter: ███████░░░░░░░░░░░░░░░░░ 28.2%
    
    By Command
    ────────────────────────────────────────────────────────────────────────
      #  Command                   Count   Saved    Avg%    Time  Impact
    ────────────────────────────────────────────────────────────────────────
     1.  rtk rg                     1917    8.3M   30.7%   591ms  ██████████
     2.  rtk read                     37  122.9K   24.6%     4ms  ░░░░░░░░░░
     3.  rtk git stash show            8  122.7K   36.4%    1.9s  ░░░░░░░░░░
     4.  rtk git diff -- apps/...      2   37.7K   47.4%    78ms  ░░░░░░░░░░
     5.  rtk git diff --ignore...      1   37.6K   92.4%    79ms  ░░░░░░░░░░
     6.  rtk git diff -- apps/...      1   37.6K   95.9%    80ms  ░░░░░░░░░░
     7.  rtk git diff -- Vitti...      1   22.2K   81.3%   120ms  ░░░░░░░░░░
     8.  rtk git diff -- sourc...      1   22.1K   81.9%   117ms  ░░░░░░░░░░
     9.  rtk git diff -- sourc...      5   20.3K   41.4%   100ms  ░░░░░░░░░░
    10.  rtk playwright test           4   19.9K   81.9%   35.9s  ░░░░░░░░░░
    ────────────────────────────────────────────────────────────────────────
    
    rtk: Failed to resolve 'Get-ChildItem' via PATH, falling back to direct exec: Binary 'Get-ChildItem' not found on PATH
    rtk: Failed to execute command: Get-ChildItem: program not found
    rtk: Failed to resolve 'Get-ChildItem' via PATH, falling back to direct exec: Binary 'Get-ChildItem' not found on PATH
    rtk: Failed to execute command: Get-ChildItem: program not found
    fatal: not a git repository (or any of the parent directories): .git
    {
      "node": "v26.7.0",
      "platform": "win32",
      "arch": "x64",
      "execPath": "C:\\Program Files\\nodejs\\node.exe"
    }
    undefined
    undefined
    C:\Program Files\nodejs\node.exe
    C:\Users\Admin\AppData\Roaming\npm\pnpm
    C:\Users\Admin\AppData\Roaming\npm\pnpm.cmd
    C:\Users\Admin\AppData\Local\Programs\OpenAI\Codex\bin\codex.exe
    ✓ • 2.85s

## Activity

    $ rtk proxy powershell -NoProfile -Command "Get-ChildItem -Force | Format-Table Mode,Length,LastWriteTime,Name -AutoSize; Get-ChildItem -Force .. | Format-Table Mode,Length,LastWriteTime,Name -AutoSize; Test-Path .git; Get-ChildItem -Force -Recurse -Depth 2 | Select-Object -First 150 FullName,Length"; rtk proxy pnpm --version; rtk proxy pnpm list -g --depth 0; rtk proxy codex --help | Select-Object -First 25
    
    Mode   Length     LastWriteTime       Name
    ----   ------     -------------       ----
    d-----            25/10/2026 22:19:19 .worktrees
    d-----            19/08/2026 16:53:55 aksharengine
    d-----            15/09/2026 21:34:39 AksharMap
    d-----            14/09/2026 15:21:20 ambikaeng
    d-----            08/05/2026 15:51:50 ArtWorkDesk
    d-----            07/10/2026 15:11:37 Artworkflow
    d-----            30/07/2026 11:24:52 CDRMactro
    d-----            05/03/2026 14:53:34 Conical-Taper-Label-Generator
    d-----            18/05/2026 12:54:56 coreldraw javascripts
    d-----            03/09/2026 14:02:11 coreldraw_api
    d-----            27/10/2026 15:22:35 DieVix
    d-----            16/07/2026 19:29:24 dolisto
    d-----            12/10/2026 10:54:01 emlviewer
    d-----            21/12/2025 13:04:30 firebird-Invoice
    d-----            03/09/2026 13:55:20 hermes-devhub
    d-----            03/08/2026 00:04:31 hindutithi
    d-----            02/08/2026 11:27:35 HumanDateDiff
    d-----            11/02/2026 18:03:01 Illustrator-Scripts-
    d-----            04/10/2026 17:39:06 intradayassist
    d-----            04/06/2026 12:51:32 Invoice-System
    d-----            02/08/2026 21:11:16 kaalchakra
    d-----            28/09/2026 12:55:09 MIMS
    d-----            10/08/2026 22:29:11 New folder
    d-----            05/10/2026 20:09:50 New folder (2)
    d-----            24/10/2026 00:56:36 pankhcms
    d-----            29/10/2026 22:53:13 pankhcms-dev
    d-----            25/10/2026 18:43:37 pankhcms-impl
    d-----            11/10/2026 23:49:37 pankhcms-release-staging
    d-----            29/10/2026 22:20:05 pankhcms-theme
    d-----            06/08/2026 18:08:49 PdfInspect
    d-----            20/07/2026 15:07:37 rallispackingslip
    d-----            12/05/2026 18:55:18 randomclick
    d-----            06/10/2026 06:57:32 Rangavalli
    d-----            11/08/2026 07:54:20 rupiya
    d-----            29/09/2026 14:19:02 sgspm.in
    d-----            07/10/2026 11:20:32 shabdamel
    d-----            04/03/2026 11:03:18 shankhcms
    d-----            16/01/2026 18:01:58 TaperedLabelGenerator
    d-----            02/10/2026 00:39:49 taper_label_studio
    d-----            14/06/2026 12:10:44 test
    d-----            01/09/2026 10:16:41 tests
    d-----            17/08/2026 09:21:56 tithi-darshan-icons
    d-----            13/08/2026 06:32:47 TithiDarshan
    d-----            14/08/2026 12:47:50 tomboy-ng-master
    d-----            17/09/2026 23:56:13 uniwamp
    d-----            05/10/2026 22:02:23 VanshVriksh
    d-----            03/10/2026 00:09:05 vectix
    d-----            31/08/2026 19:04:40 vector-pdf-smoke
    d-----            28/10/2026 19:03:02 veripress
    d-----            18/10/2026 17:05:27 vittix
    d-----            27/02/2026 11:24:06 Vittix DieManager
    d-----            20/07/2026 14:27:41 Vittix Packing Slip
    d-----            05/09/2026 09:13:12 vittix-dev-mcp
    d-----            17/09/2026 18:59:38 vittix-indic-keyboard
    d-----            18/10/2026 23:16:38 vittix-report-demo-notes
    d-----            30/10/2026 21:48:56 vittix-seo-toolkit
    d-----            21/10/2026 13:11:16 Vittix.Licensing
    d-----            28/10/2026 09:39:13 VittixAutoUpdater
    d-----            25/10/2026 13:03:52 vittixbackup
    d-----            08/09/2026 11:59:01 vittixbiz
    d-----            08/04/2026 18:03:23 VittixChequePrinting
    d-----            19/07/2026 15:26:11 vittixCMS
    d-----            26/08/2026 22:54:52 vittixcode
    d-----            29/08/2026 22:30:00 vittixcoder
    d-----            06/08/2026 19:49:28 vittixcoin
    d-----            27/10/2026 23:34:38 VittixDBGridController
    d-----            04/09/2026 23:38:59 vittixerp-dev-mcp
    d-----            09/07/2026 11:01:02 vittixFTP
    d-----            04/10/2026 02:23:37 vittixinvoice
    d-----            04/10/2026 14:13:18 vittixIRC
    d-----            22/01/2026 22:07:48 VittixKeyboard
    d-----            25/10/2026 23:14:16 VittixReport
    d-----            25/10/2026 23:33:14 VittixReport-audit-v1.0.1
    d-----            25/10/2026 22:42:43 VittixReport-backup-20261025-224240
    d-----            19/10/2026 17:54:39 VittixReport-demo-gst
    d-----            18/10/2026 17:04:39 VittixReport-fw
    d-----            26/10/2026 16:11:04 VittixReport-installer-review
    d-----            25/10/2026 17:51:32 VittixReport-pi-c4-v1.0.0
    d-----            18/10/2026 18:26:27 VittixReport-pre
    d-----            26/10/2026 00:27:45 VittixReport-remediation-v1.0.1
    d-----            26/10/2026 00:11:11 VittixReport-test-safety-fix
    d-----            26/10/2026 18:26:58 VittixReport-v1.0.1-candidate
    d-----            26/10/2026 19:16:36 VittixReport-v1.0.1-integration
    d-----            28/10/2026 11:34:08 VittixReport-v1.0.1-release-prep
    d-----            22/03/2026 10:18:11 vittixUI
    d-----            24/08/2026 23:12:53 vittixvbade
    d-----            29/09/2026 22:27:27 vittixvbadev
    d-----            31/07/2026 19:45:25 vittixvedic
    d-----            21/10/2026 23:32:56 vittixvedicpanchang
    d-----            17/09/2026 06:33:18 vittixwebsite
    d-----            20/09/2026 22:55:37 vittix_expense_tracker
    d-----            24/04/2026 14:35:20 vittix_mobile
    d-----            29/10/2026 23:34:26 vkeysnip
    d-----            25/09/2026 15:16:25 vnotes
    d-----            18/10/2026 22:44:17 vrt
    d-----            11/10/2026 12:17:28 vxt-verify
    -a---- 8320       21/09/2026 08:19:57 testrun.log
    -a---- 1284644469 05/09/2026 22:23:43 vittix.rar
    -a---- 7339265    23/09/2026 12:24:58 vittixcdrMacro.rar
    -a---- 612        04/10/2026 13:39:30 vittixIRC-KEYSTORE-INFO.txt
    
    
    False
    11.21.0
    [ERROR] The configured global bin directory "C:\Users\Admin\AppData\Local\pnpm\bin" is not in PATH
    Run "pnpm setup" to update your shell configuration.
    Codex CLI
    
    If no subcommand is specified, options will be forwarded to the interactive CLI.
    
    Usage: codex [OPTIONS] [PROMPT]
           codex [OPTIONS] <COMMAND> [ARGS]
    
    Commands:
      agents            Browse all agent sessions on the shared local app-server daemon
      exec              Run Codex non-interactively [aliases: e]
      review            Run a code review non-interactively
      login             Manage login
      logout            Remove stored authentication credentials
      mcp               Manage external MCP servers for Codex
      plugin            Manage Codex plugins
      app-server        [experimental] Run the app server or related tooling
      remote-control    [experimental] Manage the app-server daemon with remote control enabled
      app               Launch the Desktop app (opens the app installer if missing)
      completion        Generate shell completion scripts
      update            Update Codex to the latest version
      doctor            Diagnose local Codex installation, config, auth, and runtime health
      sandbox           Run commands within a Codex-provided sandbox
      debug             Debugging tools
      apply             Apply the latest diff produced by Codex agent as a `git apply` to your local
                        working tree [aliases: a]
    ✓ • 1.76s

## Assistant

The target directory currently has no project files and is not a Git repository, so there is no existing code or Git work to preserve here. Node, pnpm, Codex, and the required `rtk` command wrapper are present; I’m checking the current official compatibility guidance next.

## Activity

    Searched the web for WXT official docs React TypeScript manifest v3 browser extension permissions, WXT official docs package requirements Node version, Tailwind CSS v4 Vite official docs React compatibility, Vitest official guide requirements Node versions Playwright official Node support Dexie official docs

## Activity

    Searched the web for site:playwright.dev/docs Node.js versions supported Playwright requirements, site:developer.chrome.com/docs/extensions/develop/concepts/activeTab scripting permission, site:developer.chrome.com/docs/extensions/develop/concepts/declare-permissions activeTab scripting, site:developer.chrome.com/docs/extensions/reference/api/downloads permission Chrome

## Assistant

# Phase 0 plan

**Status: planning complete. No files were created or changed, and no dependencies were installed.** The requested approval gate remains: I’ll wait for your approval before implementation.

## Environment report

- **Working directory:** `D:\ketan\github\vittix-seo-toolkit`
- **Git:** The directory is not a Git repository (`.git` is absent); `git status` could not run successfully.
- **Project files:** None were found in the target directory.
- **Node.js:** `v26.7.0`, Windows x64.
- **pnpm:** `11.21.0`. Its global bin directory is not on PATH; pnpm reports this as a configuration warning.
- **Codex CLI:** `0.165.0`.
- **RTK:** `0.42.4`; the provided RTK instructions were followed for shell commands.

## Repository assessment

The target directory is empty of project files and has no Git metadata. There is no existing implementation, dependency manifest, test configuration, or project-specific Git history to assess.

## Proposed file structure

A small pnpm workspace should keep the extension as the only MVP application, while reserving packages for reusable domain logic if that separation becomes useful.

```text
.
├── apps/
│   └── extension/
│       ├── entrypoints/
│       │   ├── popup/
│       │   ├── dashboard/
│       │   └── background.ts
│       ├── src/
│       │   ├── analyzers/
│       │   ├── scoring/
│       │   ├── history/
│       │   ├── export/
│       │   └── components/
│       ├── public/
│       └── wxt.config.ts
├── packages/
│   └── seo-core/             # Optional shared types, analyzers, scoring
├── tests/
│   ├── fixtures/
│   └── e2e/
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.base.json
├── playwright.config.ts
├── vitest.workspace.ts
└── README.md
```

For the MVP, begin with analyzer and scoring modules inside the extension. Extract `seo-core` into a workspace package only if it has a real second consumer or needs isolated package-level testing.

## Dependency recommendations

Use current compatible stable releases when implementation begins, and record exact versions in the lockfile.

- **Build:** WXT, React, React DOM, TypeScript, and `@types/react` / `@types/react-dom`.
- **Styling:** `tailwindcss` and `@tailwindcss/vite` v4 integration. Tailwind v4 targets Chrome 111+; set the extension’s minimum supported Chrome version accordingly or revisit that choice.
- **Validation and persistence:** Zod for validating imported/exported data and persisted records; Dexie for IndexedDB-backed audit history.
- **Tests:** Vitest for unit tests and `@playwright/test` for browser-level tests.
- **Chrome API typings:** Prefer WXT’s supported browser API types or `@types/chrome` if needed; avoid maintaining duplicate or conflicting API type sources.

Compatibility checks found Node 26 within Playwright’s documented supported lines and above the current WXT / Vitest Node minimums. WXT’s current guidance requires Node 22+, TypeScript 5.4+, and Vite 6.3.4+; current Vitest guidance requires Node 22.12+ and Vite 6.4+. This makes **Vite 6.4+** the conservative shared baseline. Sources: [WXT upgrade guidance](https://wxt.dev/guide/resources/upgrading), [Vitest getting started](https://vitest.dev/guide/), and [Playwright installation](https://playwright.dev/docs/intro).

## WXT Manifest V3 architecture

- Use WXT file-based entrypoints for the toolbar popup, a dashboard page, and a lightweight MV3 service worker.
- Keep analysis logic as pure functions that accept extracted page data. Inject page inspection only after the user explicitly starts an audit.
- Use `chrome.scripting.executeScript` with a self-contained extraction function to inspect the active page’s DOM, then return serializable metadata, headings, images, and links to the extension UI.
- Persist audit history in extension-origin IndexedDB through Dexie. Keep the extension offline-capable and send no page data to a server.
- Export JSON and CSV from the extension UI using generated Blob URLs and normal browser download links.
- Have WXT generate the MV3 manifest from `wxt.config.ts`; do not hand-maintain a separate generated manifest. [WXT manifest documentation](https://wxt.dev/guide/essentials/config/manifest.html)

## Minimum Chrome permissions

Recommended runtime permissions:

- **`activeTab`** — temporary access to the current tab after the user invokes the extension.
- **`scripting`** — inject the on-demand DOM extraction function.

No broad `host_permissions` or `<all_urls>` access is needed for this on-demand design. Avoid `tabs`, `downloads`, and `storage` unless implementation requires their APIs: the dashboard can use a user-gesture-created Blob download, while audit history uses IndexedDB. Chrome documents the `activeTab` + `scripting` combination for user-triggered injection and notes that `activeTab` supplies temporary host access. Sources: [Chrome scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting), [Chrome activeTab guide](https://developer.chrome.com/docs/extensions/get-started/tutorial/scripts-activetab).

## Implementation sequence

1. Initialize Git and the pnpm workspace; set the Node/package-manager version policy and shared TypeScript strict settings.
2. Scaffold the WXT React MV3 extension, popup, dashboard, and service worker; configure permissions and check the generated manifest.
3. Define validated domain models for page snapshots and audit records.
4. Implement metadata, heading, image, and link analyzers as pure functions with fixture-based unit coverage.
5. Implement and document the scoring rules; test scoring independently from DOM extraction.
6. Add user-triggered page extraction and connect the extracted snapshot to the dashboard.
7. Add Dexie schema, local audit history, and history UI.
8. Implement JSON and CSV export, including safe serialization and CSV escaping.
9. Add Playwright coverage for the extension’s main user flow and document manual Chrome loading steps.
10. Add CI commands, privacy notes, supported Chrome baseline, and contributor instructions.

## Build and test commands

Suggested root scripts:

```text
pnpm dev                 # WXT development build / browser launch
pnpm build               # Production extension build
pnpm zip                 # Package production extension
pnpm typecheck           # tsc --noEmit (or package-level equivalent)
pnpm lint                # ESLint, if adopted
pnpm test                # Vitest unit tests
pnpm test:watch          # Vitest watch mode
pnpm test:e2e            # Playwright extension-flow tests
pnpm test:e2e:ui         # Playwright UI mode
```

For reproducible CI, use `pnpm install --frozen-lockfile`, then typecheck, lint, unit tests, production build, and Playwright tests. Confirm the exact WXT command names against the selected WXT release when creating scripts.

## Acceptance criteria

- The extension builds as Manifest V3 and loads unpacked in the documented Chrome baseline.
- It requests only `activeTab` and `scripting` for the on-demand audit flow.
- A user action audits the current page without permanent broad host access.
- Metadata, heading, image, and link results are correct against representative fixtures.
- Scoring is deterministic and its rules are documented and tested.
- Audit history persists locally across extension restarts and can be cleared.
- JSON and CSV exports contain the selected audit and correctly escape CSV values.
- Unit and Playwright suites cover analyzer/scoring behavior and the main audit-to-export flow.
- No page content or audit data is transmitted off-device.

## Risks and dependencies

- **Node version policy:** Node 26 works with the currently documented tool requirements, but pinning a supported LTS version (Node 24 or 22) may give contributors and CI a more predictable baseline.
- **pnpm setup:** The current global bin PATH warning may affect globally installed commands; workspace-local scripts should avoid depending on global binaries.
- **Extension-page restrictions:** Chrome internal pages, restricted schemes, and some embedded frames cannot be injected into. The UI should handle injection failures clearly.
- **Audit expectations:** SEO heuristics and score weights need product decisions; scores should explain their findings instead of implying search ranking predictions.
- **Large pages:** DOM extraction and persisted snapshots may be large. Define reasonable caps for collected link/image data and history retention.
- **IndexedDB lifecycle:** Extension upgrades may require schema migrations and explicit handling of malformed or older records.
- **Automated extension testing:** Playwright can launch Chromium with an unpacked extension, but browser packaging and CI setup need validation on the chosen runner.
- **Tailwind baseline:** Tailwind v4’s Chrome 111 minimum must align with the product’s supported browser version.

No code has been changed. I’ll wait for your approval before starting implementation.

## User

You are the Lead Software Architect for Vittix SEO Toolkit.

PROJECT
Name: Vittix SEO Toolkit
Repository: vittix-seo-toolkit
License: MIT
Platform: Chrome Extension Manifest V3

PRODUCT VISION
Build a professional, privacy-first, open-source SEO Chrome extension for SEO professionals, digital marketing agencies, website owners and developers.

TECHNOLOGY STACK
- WXT
- React
- TypeScript (strict mode)
- Tailwind CSS 4
- pnpm workspace
- Vitest
- Playwright
- Zod
- Dexie / IndexedDB
- Lucide icons

MVP FEATURES
1. SEO dashboard
2. Metadata analyzer
3. Heading analyzer
4. Image analyzer
5. Link analyzer
6. SEO scoring engine
7. Local audit history
8. JSON and CSV export

TASK: PHASE 0  ARCHITECTURE INSPECTION AND PLANNING

Perform a comprehensive READ-ONLY inspection.

STEP 1  ENVIRONMENT
- Inspect current working directory.
- Check Git repository and branch.
- Check Git status.
- Check Node.js version.
- Check pnpm version.
- Check Codex CLI environment where detectable.
- Identify operating system and available development tools.

STEP 2  REPOSITORY INSPECTION
- Inspect existing files and directories.
- Read existing project instructions.
- Inspect package manifests and dependencies.
- Identify existing user changes.
- Identify potential conflicts with the proposed architecture.

STEP 3  DEPENDENCY COMPATIBILITY
Evaluate compatibility of:
- WXT
- React
- TypeScript
- Tailwind CSS 4
- pnpm
- Vitest
- Playwright
- Zod
- Dexie
- Lucide React

Recommend compatible stable versions.

Do not blindly select latest versions.
Consider Node.js compatibility and WXT requirements.

STEP 4  ARCHITECTURE
Design:
- pnpm workspace structure.
- Extension entry points.
- Popup architecture.
- Full dashboard architecture.
- Options page.
- Content script.
- Background service worker.
- SEO extraction layer.
- SEO rule engine.
- Scoring engine.
- Storage layer.
- Export engine.

Keep seo-core independent of React and Chrome APIs.

STEP 5  SECURITY AND PRIVACY
Recommend minimum Manifest V3 permissions.

Evaluate:
- activeTab
- storage
- scripting
- optional host permissions

Avoid unnecessary permissions.

Ensure:
- No remote executable JavaScript.
- No automatic page-content transmission.
- No hardcoded API credentials.
- No hidden telemetry.
- No unnecessary browsing history access.
- Local-first SEO analysis.

STEP 6  PROPOSED REPOSITORY STRUCTURE

Design a pnpm workspace with:

apps/
  extension/

packages/
  seo-core/
  ai-core/
  shared/

docs/
  PRODUCT_SPEC.md
  ARCHITECTURE.md
  SEO_RULES.md
  SECURITY.md
  PRIVACY.md
  DEVELOPMENT.md
  TESTING.md
  ROADMAP.md

.github/
  workflows/

Refine this structure if technically necessary.

STEP 7  DEVELOPMENT COMMANDS

Propose root package scripts for:

- dev
- build
- build:chrome
- lint
- typecheck
- test
- test:watch
- test:e2e
- clean

Explain which commands should run in CI.

STEP 8  PHASE 0 IMPLEMENTATION PLAN

Prepare a detailed implementation sequence covering:

1. Workspace initialization.
2. WXT configuration.
3. React integration.
4. Tailwind CSS integration.
5. TypeScript configuration.
6. Shared package configuration.
7. SEO core package configuration.
8. Testing configuration.
9. ESLint and Prettier.
10. GitHub Actions CI.
11. Minimal working Chrome extension.

STEP 9  ACCEPTANCE CRITERIA

Define measurable completion criteria for Phase 0.

At minimum:
- Workspace installation succeeds.
- TypeScript compilation succeeds.
- ESLint succeeds.
- Vitest runs.
- WXT production build succeeds.
- Chrome can load the unpacked extension.
- No unexpected permissions.
- No secrets committed.
- Existing user changes remain untouched.

STEP 10  RISKS
Identify:
- Dependency compatibility risks.
- WXT architecture risks.
- Manifest V3 restrictions.
- Content-script limitations.
- Browser permission limitations.
- Tailwind CSS 4 integration risks.
- Testing and CI risks.

STRICT EXECUTION RULES

THIS IS READ-ONLY PLANNING.

DO NOT:
- Create files.
- Modify files.
- Delete files.
- Rename files.
- Install packages.
- Update dependencies.
- Run migrations.
- Commit changes.
- Push changes.
- Switch branches.
- Start implementation.

Do not overwrite or discard any existing user changes.

If the repository is empty, report that fact.
If the repository does not exist, report that fact.
Do not assume anything about the current environment.

FINAL REPORT FORMAT

1. Executive Summary
2. Environment Report
3. Git Repository Status
4. Existing Repository Assessment
5. Dependency Compatibility Matrix
6. Recommended Architecture
7. Proposed Repository Structure
8. Chrome Permissions and Security
9. Development Commands
10. Phase 0 Implementation Plan
11. Acceptance Criteria
12. Risks and Mitigations
13. Final Recommendation

FINAL DECISION

Provide one verdict:

GO  Ready for Phase 0 implementation.

or

NO-GO  Issues must be resolved first.

Do not proceed beyond planning.

Wait for explicit owner approval.

## Assistant

I’ll expand the earlier read-only assessment to cover the full requested stack and architecture, including ai-core/shared boundaries, options UI, security, and CI. I’ll recheck the repository and local tool availability, then use official project documentation for version compatibility.

## Activity

    $ rtk proxy powershell -NoProfile -Command "Write-Output '--- location ---'; Get-Location; Write-Output '--- target files (depth 3) ---'; Get-ChildItem -LiteralPath . -Force -Recurse -Depth 3 | Select-Object FullName,Mode,Length,LastWriteTime; Write-Output '--- root entries ---'; Get-ChildItem -LiteralPath . -Force | Select-Object Name,Mode,Length; Write-Output '--- git metadata ---'; Test-Path .git; Write-Output '--- parent git detection ---'; git rev-parse --show-toplevel 2>&1; git branch --show-current 2>&1; git status --short --branch 2>&1; Write-Output '--- versions ---'; node --version; pnpm --version; codex --version; rtk --version; Write-Output '--- OS ---'; Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber,OSArchitecture; Write-Output '--- tools ---'; foreach ($tool in @('git','node','pnpm','codex','rtk','corepack','python','docker','gh')) { $resolved = Get-Command $tool -ErrorAction SilentlyContinue; if ($resolved) { Write-Output ($tool + ': ' + $resolved.Source) } else { Write-Output ($tool + ': unavailable') } }; Write-Output '--- parent instructions ---'; Get-ChildItem -LiteralPath .. -Filter AGENTS.md -Force -ErrorAction SilentlyContinue | Select-Object FullName; Write-Output '--- global pnpm info ---'; pnpm config get global-bin-dir; pnpm config get store-dir"
    At line:1 char:769
    + ... umber,OSArchitecture; Write-Output '--- tools ---'; foreach ( in @('g ...
    +                                                                  ~
    Missing variable name after foreach.
    At line:1 char:843
    + ... ode','pnpm','codex','rtk','corepack','python','docker','gh')) {  = Ge ...
    +                                                                 ~
    Unexpected token ')' in expression or statement.
    At line:1 char:898
    + ... ,'gh')) {  = Get-Command  -ErrorAction SilentlyContinue; if () { Writ ...
    +                                                                  ~
    Missing condition in if statement after 'if ('.
    At line:1 char:925
    + ... ErrorAction SilentlyContinue; if () { Write-Output ( + ': ' + .Source ...
    +                                                                  ~
    You must provide a value expression following the '+' operator.
    At line:1 char:926
    + ... ion SilentlyContinue; if () { Write-Output ( + ': ' + .Source) } else ...
    +                                                           ~~~~~~~
    Unexpected token '.Source' in expression or statement.
    At line:1 char:925
    + ... ErrorAction SilentlyContinue; if () { Write-Output ( + ': ' + .Source ...
    +                                                                  ~
    Missing closing ')' in expression.
    At line:1 char:900
    + ... h')) {  = Get-Command  -ErrorAction SilentlyContinue; if () { Write-O ...
    +                                                                 ~
    Missing closing '}' in statement block or type definition.
    At line:1 char:845
    + ... e','pnpm','codex','rtk','corepack','python','docker','gh')) {  = Get- ...
    +                                                                 ~
    Missing closing '}' in statement block or type definition.
    At line:1 char:933
    + ... on SilentlyContinue; if () { Write-Output ( + ': ' + .Source) } else  ...
    +                                                                 ~
    Unexpected token ')' in expression or statement.
    At line:1 char:935
    + ...  SilentlyContinue; if () { Write-Output ( + ': ' + .Source) } else {  ...
    +                                                                 ~
    Unexpected token '}' in expression or statement.
    Not all parse errors were reported.  Correct the reported errors and try again.
        + CategoryInfo          : ParserError: (:) [], ParentContainsErrorRecordException
        + FullyQualifiedErrorId : MissingVariableNameAfterForeach
    
    ✗ (1) • 1.04s

## Activity

    $ rtk proxy powershell -NoProfile -Command "Get-Location; Get-ChildItem -LiteralPath . -Force -Recurse -Depth 3 | Select-Object FullName,Mode,Length,LastWriteTime; Test-Path .git; git rev-parse --show-toplevel; git branch --show-current; git status --short --branch; node --version; pnpm --version; codex --version; rtk --version; Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber,OSArchitecture; Get-Command git,node,pnpm,codex,rtk,corepack,python,docker,gh -ErrorAction SilentlyContinue | Select-Object Name,Source; pnpm config get global-bin-dir; pnpm config get store-dir"
    
    fatal: not a git repository (or any of the parent directories): .git
    fatal: not a git repository (or any of the parent directories): .git
    fatal: not a git repository (or any of the parent directories): .git
    v26.7.0
    11.21.0
    codex-cli 0.165.0
    rtk 0.42.4
    Path
    ----
    D:\ketan\github\vittix-seo-toolkit
    False
    
    Caption        : Microsoft Windows 11 Pro
    Version        : 10.0.26100
    BuildNumber    : 26100
    OSArchitecture : 64-bit
    
    
    Name   : git.exe
    Source : C:\Program Files\Git\cmd\git.exe
    
    
    Name   : node.exe
    Source : C:\Program Files\nodejs\node.exe
    
    
    Name   : pnpm.ps1
    Source : C:\Users\Admin\AppData\Roaming\npm\pnpm.ps1
    
    
    Name   : codex.exe
    Source : C:\Users\Admin\AppData\Local\Programs\OpenAI\Codex\bin\codex.exe
    
    
    Name   : rtk.exe
    Source : C:\Users\Admin\.local\bin\rtk.exe
    
    
    Name   : python.exe
    Source : C:\Program Files\Python39\python.exe
    
    
    Name   : docker.exe
    Source : C:\Program Files\Docker\Docker\resources\bin\docker.exe
    
    
    Name   : gh.exe
    Source : C:\Program Files\GitHub CLI\gh.exe
    
    undefined
    undefined
    
    
    ✓ • 4.17s

## Activity

    Searched the web for site:wxt.dev/guide WXT Node.js 22 Vite 6.3.4 requirements 0.21, site:pnpm.io/installation pnpm 11 Node.js compatibility requirements, site:vitest.dev/guide latest Vitest Node v22.12 Vite 6.4 requirements, site:playwright.dev/docs/intro Node.js 22 24 26 requirement Playwright

## Activity

    Searched the web for site:react.dev/blog React 19.2 release stable, site:typescriptlang.org/docs TypeScript 5.9 release, site:zod.dev Zod 4 stable release, site:dexie.org Dexie 4 documentation

## Activity

    Searched the web for site:wxt.dev/guide/essentials/commands WXT build clean dev command -b chrome, site:dexie.org/docs Dexie v4 IndexedDB documentation, site:lucide.dev/guide/packages/lucide-react React icons package, site:tailwindcss.com/docs/installation/framework-guides/vite Tailwind Vite plugin React

## Activity

    Searched the web for site:typescriptlang.org/docs/handbook/release-notes TypeScript 6.0 release notes 2026, site:tailwindcss.com/blog Tailwind CSS v4.2 2026, site:dexie.org/blog Dexie 4 latest version 2026

## Assistant

## 1. Executive Summary

The target directory exists but is empty: it has no project files and is not a Git repository. There are no existing user changes or architecture conflicts to assess.

The available environment meets the current documented Node.js requirements for the proposed stack. A privacy-first MVP can use WXT, a small React popup, a full extension dashboard, and on-demand page inspection without broad host access.

**Verdict: GO — Ready for Phase 0 implementation.** The first implementation step should initialize Git and the pnpm workspace. This report is planning only; I have not created or changed files or installed dependencies.

## 2. Environment Report

| Item | Observed |
|---|---|
| Working directory | `D:\ketan\github\vittix-seo-toolkit` |
| Operating system | Windows 11 Pro, 64-bit |
| Node.js | `v26.7.0` |
| pnpm | `11.21.0` |
| Codex CLI | `0.165.0` |
| RTK | `0.42.4` |
| Available tools | Git, Node.js, pnpm, Codex, RTK, Python, Docker, GitHub CLI |

pnpm reports that its configured global bin directory is not on PATH. This should not prevent workspace-local commands from working, but it is an environment setup item to track.

## 3. Git Repository Status

The target directory is **not a Git repository**. `git status` and branch inspection could not run because there is no `.git` metadata; therefore, no branch or tracked/untracked change status is available.

There are no files in the target directory to overwrite or preserve.

## 4. Existing Repository Assessment

The directory contains no project files or subdirectories. There are no package manifests, dependencies, local project instructions, tests, or existing implementation to inspect. The supplied `AGENTS.md` instruction points to `C:\Users\Admin\.codex\RTK.md`, which requires shell commands to be prefixed with `rtk`; that instruction was read and followed for shell inspection.

## 5. Dependency Compatibility Matrix

These are recommended **version lines**, not lockfile pins. Resolve and lock exact patch versions during implementation, then keep updates reviewed.

| Dependency | Recommendation | Compatibility notes |
|---|---|---|
| WXT | `0.21.x` | Current WXT documentation shows `0.21.5`. It is still pre-1.0, so minor updates can include breaking changes. WXT requires Node 22+, TypeScript 5.4+, and Vite 6.3.4+ in this line. [WXT upgrade guidance](https://wxt.dev/guide/resources/upgrading), [WXT CLI](https://wxt.dev/api/cli/wxt) |
| React / React DOM | `19.2.x` | Mature stable line suitable for this UI; keep both packages on the same version line. React 19.3 is also listed as stable, but 19.2 is a more conservative MVP baseline. [React versions](https://react.dev/versions) |
| TypeScript | `5.9.x` | Meets WXT’s minimum and avoids adopting the TypeScript 6 transition changes at project start. Revisit TypeScript 6 after configuration and ecosystem support are validated. [TypeScript 5.9 notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-9.html), [TypeScript 6 notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html) |
| Vite | `7.x` | Supported by WXT’s current version line and exceeds Vitest’s documented Vite 6.4 minimum. Use one shared Vite version across the workspace. [WXT upgrade guidance](https://wxt.dev/guide/resources/upgrading), [Vitest guide](https://vitest.dev/guide/) |
| Tailwind CSS | `4.3.x` with matching `@tailwindcss/vite` | Tailwind’s Vite plugin is the recommended Vite integration. Tailwind v4 targets Chrome 111+, so set the extension’s supported Chrome baseline accordingly. [Tailwind CSS Vite setup](https://tailwindcss.com/docs/installation/using-vite), [Tailwind compatibility](https://tailwindcss.com/docs/compatibility) |
| pnpm | Pin `11.21.0` initially | Matches the installed version and supports Node 26. Keep the repo’s package-manager version pinned for reproducible installs. pnpm 11 requires Node 22+. [pnpm installation and compatibility](https://pnpm.io/installation), [pnpm 11 release](https://pnpm.io/blog/releases/11.0) |
| Vitest | `5.1.x` | Current supported line; requires Node 22.12+ and Vite 6.4+. Node 26 and proposed Vite 7 meet those requirements. [Vitest releases](https://main.vitest.dev/releases), [Vitest migration requirements](https://main.vitest.dev/guide/migration/) |
| Playwright | Current stable `1.x`, pinned in lockfile | Current docs support Node 22, 24, or 26 and Windows 11+. Browser binaries must be installed in CI; extension testing should use Chromium. [Playwright installation](https://playwright.dev/docs/intro) |
| Zod | `4.x` | Stable major line. Use for external data and persisted-record validation; avoid relying on compatibility layers unless a concrete integration requires them. [Zod 4 release notes](https://zod.dev/v4) |
| Dexie | `4.x` | Use for local IndexedDB audit history. Keep schema versioning and migrations explicit. [Dexie documentation](https://dexie.org/docs) |
| Lucide React | Current stable `lucide-react` release | Official React package is typed and tree-shakable; import only used icons. [Lucide React guide](https://lucide.dev/guide/react/) |

For contributors and CI, prefer **Node 24 LTS** as the project baseline; Node 26 is already installed and is supported by the current Playwright documentation. Set the declared engine to Node `>=22.12` if compatibility with Node 22 is desired.

## 6. Recommended Architecture

### Workspace boundaries

- **`apps/extension`** owns all Chrome-specific code, WXT configuration, React user interfaces, and browser integration.
- **`packages/seo-core`** owns deterministic SEO extraction-data analysis, rule evaluation, and scoring. It must not import React, WXT, or Chrome APIs.
- **`packages/shared`** owns transport-neutral schemas and shared data contracts, such as audit snapshots, finding records, settings, and export formats. It may use Zod but should not depend on the extension.
- **`packages/ai-core`** is not needed for the MVP. Reserve it in the roadmap; add it only when an AI feature and provider/privacy design are approved. It must not contain credentials or cause page data to be transmitted by default.

### Extension entry points and flow

- **Popup:** A compact React panel for the current page, showing scan availability, a run-audit action, summary score, and a link to the full dashboard.
- **Dashboard:** A full extension page for the current audit, analyzer findings, score explanations, local history, and JSON/CSV export.
- **Options page:** A WXT options entrypoint for user-controlled settings such as history retention and scoring preferences. Do not request broad site access from this page.
- **Content script / inspector:** Use a one-shot, user-triggered inspector through `chrome.scripting` after the user invokes an audit. Do not register a persistent all-sites content script for the MVP.
- **Background service worker:** Keep it minimal and event-driven. It can handle extension events or message coordination; do not make it a long-running analysis or storage process.
- **Extraction layer:** Inspect the live DOM only after user action and return a bounded, serializable page snapshot. It should not fetch page resources or transmit page content.
- **Rule engine:** Pure analyzer modules consume the snapshot and return typed findings with severity, evidence, and explanation.
- **Scoring engine:** Pure deterministic code converts findings into a documented score. Keep scoring separate from DOM inspection and UI code.
- **Storage layer:** Dexie/IndexedDB in the extension origin stores local audit history. Version the database schema and define retention/clear-history behavior.
- **Export engine:** Pure JSON and CSV serializers consume validated audit records. Trigger file downloads from the extension page through a Blob URL and user gesture.
- **Dependency direction:** `extension → seo-core → shared`; UI components and Chrome APIs must not leak into `seo-core`.

WXT generates `manifest.json` from configuration and entrypoints. Its development mode may add permissions needed for hot reload, so verify the **production** manifest separately. [WXT manifest documentation](https://wxt.dev/guide/essentials/config/manifest.html)

## 7. Proposed Repository Structure

```text
.
├── apps/
│   └── extension/
│       ├── entrypoints/
│       │   ├── popup/
│       │   ├── dashboard/
│       │   ├── options/
│       │   └── background.ts
│       ├── src/
│       │   ├── features/
│       │   ├── platform/
│       │   ├── storage/
│       │   ├── export/
│       │   └── styles/
│       ├── public/
│       ├── wxt.config.ts
│       └── package.json
├── packages/
│   ├── shared/
│   │   ├── src/
│   │   └── package.json
│   └── seo-core/
│       ├── src/
│       │   ├── analyzers/
│       │   ├── rules/
│       │   └── scoring/
│       └── package.json
├── docs/
│   ├── PRODUCT_SPEC.md
│   ├── ARCHITECTURE.md
│   ├── SEO_RULES.md
│   ├── SECURITY.md
│   ├── PRIVACY.md
│   ├── DEVELOPMENT.md
│   ├── TESTING.md
│   └── ROADMAP.md
├── .github/
│   └── workflows/
│       └── ci.yml
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.base.json
├── eslint.config.js
├── .prettierrc.json
├── vitest.config.ts
├── playwright.config.ts
└── README.md
```

`ai-core` is deliberately omitted from the initial workspace because the MVP has no AI feature. `docs/ROADMAP.md` can record the boundary and criteria for introducing it later.

## 8. Chrome Permissions and Security

### MVP permissions

Request only:

- **`activeTab`** — temporary access to the active tab following a user gesture.
- **`scripting`** — inject the on-demand inspector into that tab.

Chrome documents this `activeTab` plus `scripting` pattern for user-triggered script injection. It avoids permanent `<all_urls>` access. [Chrome scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting), [Chrome activeTab guide](https://developer.chrome.com/docs/extensions/get-started/tutorial/scripts-activetab)

Do not request `storage` when settings and history use Dexie/IndexedDB. Add it only if implementation uses the `chrome.storage` API. Do not request `downloads` if export uses Blob links initiated from the dashboard. Avoid `tabs` unless a concrete API use requires privileged tab fields; querying or creating tabs does not automatically require the broad `tabs` permission in every case.

Use `optional_host_permissions` only for a later, clearly explained feature that genuinely needs persistent origin access. Keep it out of the MVP.

### Privacy and security controls

- No remote executable JavaScript or remotely hosted code.
- No automatic or background page-content transmission.
- No hidden telemetry or analytics.
- No hardcoded API credentials.
- No browsing-history access.
- Minimize collected page data and bound the number of links/images retained per audit.
- Keep page snapshots and audit history local; disclose that users can export or clear them.
- Validate imported and persisted data with Zod, and escape CSV fields.
- Review the production manifest and packaged output for permissions, secrets, and unexpected network behavior.

## 9. Development Commands

Proposed root scripts should delegate to package scripts and avoid a task-runner dependency in the MVP:

| Script | Purpose |
|---|---|
| `pnpm dev` | Start the extension’s WXT development server for Chrome. |
| `pnpm build` | Build all workspace packages and the extension for production. |
| `pnpm build:chrome` | Build the production Chrome MV3 artifact explicitly. |
| `pnpm lint` | Run ESLint across the workspace. |
| `pnpm typecheck` | Run TypeScript checks across packages and extension. |
| `pnpm test` | Run Vitest once. |
| `pnpm test:watch` | Run Vitest in watch mode for local development. |
| `pnpm test:e2e` | Run Playwright tests against the built unpacked extension. |
| `pnpm clean` | Clean WXT generated output and other package build artifacts. |

WXT’s CLI documents `wxt build -b chrome` and `wxt clean`; use those for the Chrome build and extension cleanup. [WXT CLI](https://wxt.dev/api/cli/wxt)

**CI should run:** frozen-lockfile install, lint, typecheck, Vitest, production Chrome build, production manifest permission check, and Playwright Chromium tests. Run Playwright after building the extension; install the matching browser binaries in the CI job.

## 10. Phase 0 Implementation Plan

1. **Workspace initialization:** Initialize Git, pin pnpm and Node policy, create workspace root manifest and `pnpm-workspace.yaml`, and define ignore rules.
2. **WXT configuration:** Create the extension package, configure Chrome MV3, set the minimum supported Chrome version, and define the minimal production permissions.
3. **React integration:** Add popup, dashboard, and options entrypoints with shared layout conventions and typed routing/navigation.
4. **Tailwind CSS integration:** Add Tailwind v4 and its Vite plugin through WXT’s Vite configuration; confirm CSS is included in all extension pages.
5. **TypeScript configuration:** Add strict shared compiler settings and appropriate extension/worker type environments; avoid mixing DOM and service-worker globals unnecessarily.
6. **Shared package configuration:** Define stable package exports for Zod schemas and transport-neutral domain types.
7. **SEO core package configuration:** Set up a React- and Chrome-independent package for analyzers, rules, and scoring with explicit inputs and outputs.
8. **Testing configuration:** Configure Vitest for shared/core unit tests and Playwright for built-extension browser flows.
9. **ESLint and Prettier:** Configure TypeScript-aware linting, React hooks rules, formatting, and consistent workspace scripts.
10. **GitHub Actions CI:** Add frozen-lockfile install, lint, typecheck, unit tests, production build, manifest checks, and Chromium extension E2E.
11. **Minimal working Chrome extension:** Build a visible popup/dashboard/options shell, load it unpacked, verify the generated production manifest, and confirm the scan button can perform an on-demand read-only DOM extraction.

After this foundation, implement the MVP analyzers, scoring, history, and exports in separate feature increments.

## 11. Acceptance Criteria

Phase 0 is complete when:

- Workspace installation succeeds using the pinned Node/pnpm toolchain and frozen lockfile in CI.
- Strict TypeScript checks pass for all workspace packages.
- ESLint and formatting checks pass.
- Vitest runs successfully in CI.
- WXT creates a production Chrome MV3 build.
- Chrome loads the unpacked production build, and popup, dashboard, and options pages open.
- The production manifest contains only the intended permissions: `activeTab` and `scripting`.
- The active-page inspection flow is user-triggered and does not require broad host access.
- The workspace boundaries keep `seo-core` free of React and Chrome API dependencies.
- No secrets, remote executable code, hidden telemetry, or unexpected network requests are present in the built extension.
- Playwright verifies the basic extension interaction on the CI Chromium build.
- Documentation covers setup, architecture, rules, security, privacy, testing, and roadmap.
- Existing user changes remain untouched; because this directory is currently empty and has no Git metadata, implementation begins by initializing Git in the correct project directory.

## 12. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| WXT is still pre-1.0; minor versions can be breaking. | Pin the WXT line and review upgrades deliberately. |
| WXT, Vite, and Vitest each constrain the compatible Vite range. | Use one Vite 7 line and verify install/build/typecheck in CI. |
| Tailwind v4 integration may need careful wiring through WXT’s Vite config. | Validate CSS in every extension entrypoint early; document Chrome 111+ baseline. |
| Manifest V3 service workers can be suspended. | Keep background code event-driven and avoid relying on process memory. |
| Page injection is restricted on internal/browser pages and some protected contexts. | Detect unsupported pages and present a clear actionable message. |
| `activeTab` access is temporary and tied to a user gesture. | Start the audit directly from the popup action and handle tab navigation/injection failures. |
| Content scripts run in an isolated world and work against dynamic page DOM. | Return a bounded snapshot and avoid depending on page JavaScript variables. |
| SEO rules and score weights are heuristics. | Document each rule, severity, and scoring rationale; avoid implying ranking prediction. |
| Large pages can produce oversized snapshots or history. | Cap extracted records and define retention controls. |
| Dexie schema changes can affect local user data. | Version IndexedDB migrations and test upgrades with representative stored records. |
| Extension E2E testing can be sensitive to browser and CI configuration. | Pin Playwright, install its matching Chromium, and validate the unpacked-extension flow in CI. |
| pnpm global-bin warning can confuse local setup. | Use workspace scripts and document local PATH setup only if global commands become necessary. |
| TypeScript 6 introduces configuration changes. | Start on TypeScript 5.9, then evaluate TypeScript 6 in a dedicated compatibility update. |

## 13. Final Recommendation

**GO — Ready for Phase 0 implementation.**

The target directory is empty and not a Git repository, so there is no existing code or user work at risk in the inspected location. The implementation plan should begin with Git initialization and workspace setup, then establish the WXT production manifest and CI checks before feature work.

This remains a read-only planning result. I’ll wait for explicit owner approval before proceeding.
