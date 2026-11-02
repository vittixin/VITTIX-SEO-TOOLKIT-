# Theme and contrast audit

The production build was captured in light and dark themes at 1280 px and 400 px widths for the popup, side panel, options page, and all 12 dashboard sections. The screenshots are in `dark-theme/`. The Playwright contrast audit inspected **2,224 visible text nodes** and found **0 below 4.5:1**. It also checked visible field borders, button borders, focus outlines/rings, severity indicators, and SVG indicators at 3:1 and found **0 failures**.

The initial scan found 126 low contrast nodes:

- 22 `text-slate-500` nodes on the page surface (minimum 3.75:1).
- 23 `text-slate-500` nodes on cards (minimum 3.07:1).
- 72 dashboard footer labels and version details using `text-slate-500` (minimum 3.74:1).
- 9 Danger zone labels, explanatory copy, and the “Clear all data” control in the options page and dashboard settings.

Muted text, controls, and score-ring tracks now use semantic tokens. Danger text, surfaces, and borders use `--vittix-text-danger`, `--vittix-surface-danger`, and `--vittix-border-danger`. Both themes have explicit token values.

`dark-theme/contrast-failures.json` records the final measured counts and any failing elements. The production-build e2e computes contrast for rendered RGB, sRGB, and OKLCH colors and fails below the WCAG thresholds.

A separate production-build fixture test seeds a stored audit so the score ring and severity badges are present. In both themes it measured both score-ring strokes at 3:1 or higher and 50 severity badges at 4.5:1 or higher. Light theme score-ring ratios were 4.76:1 and 3.77:1; dark theme ratios were 5.71:1 and 3.88:1. The lowest severity-badge text ratio was 4.72:1 in both themes. This supplements the view matrix, whose empty-audit state does not render these components.
