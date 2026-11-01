# Dark theme audit

The production build was captured at 1280 px and 400 px widths for the popup, side panel, options page, and all 12 dashboard sections. The screenshots are in this directory. The Playwright contrast audit inspected 1,112 visible text nodes across those views and found **0 nodes below 4.5:1** after the fixes.

The initial scan found 126 low contrast nodes:

- 22 `text-slate-500` nodes on the page surface (minimum 3.75:1).
- 23 `text-slate-500` nodes on cards (minimum 3.07:1).
- 72 dashboard footer labels and version details using `text-slate-500` (minimum 3.74:1).
- 9 Danger zone labels, explanatory copy, and the “Clear all data” control in the options page and dashboard settings.

The muted text now uses the `--vittix-text-muted` semantic token, and danger text, surfaces, and borders use `--vittix-text-danger`, `--vittix-surface-danger`, and `--vittix-border-danger`. Dark-mode values preserve readable contrast without changing the light theme.

`contrast-failures.json` records the final measured count and any failing visible text nodes. The e2e test computes contrast for rendered RGB, sRGB, and OKLCH colors and fails if any visible text is below 4.5:1.
