# SEO audit: Vittix Real Flow Fixture Page With A Long Title

URL: https://fixture\.test/real\-flow
Analyzed: 2026\-11\-01T08:15:43\.660Z · Profile: standard · Rule set: 0\.5\.0
Score: 97/100 — Excellent (preliminary)

## Warning (3)

- [ ] **content\-length — Thin content: only 43 words** (Content)
  - The page body contains only 43 words; pages with fewer than 300 words rarely rank for competitive queries and give search engines little context\. This heuristic cannot detect genuinely sparse page types \(legal notices, contact forms\) — use judgment\.
  - Remediation: Expand the unique, useful text content around the page's primary topic toward 300\+ words; avoid padding\.
- [ ] **image\-dimensions\-missing — 1 image without width/height attributes** (Images)
  - Images without width/height attributes can cause layout shift \(CLS\) while the page loads: the browser cannot reserve space before the image arrives\. Setting intrinsic dimensions is a cheap, reliable fix\. This is a markup heuristic, not a measured performance result\.
  - Evidence: `/img/a.png`
  - Remediation: Add width and height attributes \(or an aspect\-ratio CSS rule\) so the browser reserves space\.
- [ ] **og\-image\-present — No Open Graph image** (Social)
  - og:image is the preview image for social shares\. Pages without one render a blank or generic preview\.
  - Remediation: Add <meta property="og:image" content="https://…"\> with an absolute image URL \(1200×630 works well\)\.

## Info (8)

- [ ] **description\-pixel\-width — Description may be truncated on mobile \(pixel width\)** (Metadata)
  - The rendered width is approximately 881px \(desktop budget ≈920px, mobile ≈680px at 14px in an Arial/Roboto\-like font\)\. Search engines truncate descriptions by PIXELS, not characters\. This is an estimate \(±10–15%\)\.
  - Evidence: `A fixture description crafted to sit inside the healthy seventy to one hundred sixty character window used by the analyzer.`
  - Remediation: Shorten the description, front\-loading the value proposition so the truncation point lands on the key message\.
- [ ] **favicon\-present — No favicon found** (Technical)
  - No <link rel="icon"\> was found\. Browsers fall back to /favicon\.ico; a declared favicon improves brand display in tabs, bookmarks and search results\.
  - Remediation: Add <link rel="icon" href="/favicon\.ico" sizes="any"\> \(plus a touch/icon set\) to <head\>\.
- [ ] **image\-modern\-format — 1 legacy\-format image without modern alternatives** (Images)
  - JPEG/PNG/GIF/BMP images without a <picture\> wrapper or srcset give up the size savings of AVIF/WebP\. Serving modern formats typically cuts image bytes 20–50%\. This is a source\-extension heuristic — servers can serve modern formats from \.jpg URLs, so treat it as a lead, not a verdict\.
  - Evidence: `/img/a.png`
  - Remediation: Serve AVIF/WebP via <picture\> or content negotiation, with the legacy format as fallback\.
- [ ] **keyword\-in\-h1 — Target keyword is not in the h1** (Content)
  - No h1 contains the target keyword "fixture"\. Alignment between the h1 and the target term reinforces topical relevance\.
  - Evidence: `real flow main heading`
  - Remediation: Align the h1 with the page’s target keyword where it reads naturally\.
- [ ] **link\-profile — Link profile** (Links)
  - 1 internal · 0 external · 0 mailto/tel/other
- [ ] **og\-description\-present — No Open Graph description** (Social)
  - og:description summarizes the page for social shares\. Optional for search rankings, valuable for click\-through from social\.
  - Remediation: Add <meta property="og:description" content="…"\> summarizing the page\.
- [ ] **og\-url\-matches\-canonical — No og:url declared** (Social)
  - og:url states the canonical URL for social scrapers\. Without it, platforms use the shared URL including its parameters\.
  - Remediation: Add <meta property="og:url" content="…"\> matching the canonical URL\.
- [ ] **structured\-data\-present — No JSON\-LD structured data found** (Technical)
  - No <script type="application/ld\+json"\> blocks were found\. Structured data helps machines understand entities on the page \(products, articles, FAQs\)\. Missing it is common and not an error by itself\.
  - Remediation: If the page represents a distinct entity \(article, product, organization, …\), add a JSON\-LD block describing it\.

## Passed (37)

- [ ] **canonical\-present — Canonical URL declared** (Metadata)
  - The page declares a canonical URL\.
  - Evidence: `https://fixture.test/real-flow`
- [ ] **canonical\-self\-reference — Canonical URL is self\-referencing** (Metadata)
  - The canonical points at this page itself — the clearest signal of the preferred version\.
- [ ] **canonical\-valid — Canonical URL is valid** (Metadata)
  - The canonical is a single absolute http\(s\) URL\.
- [ ] **h1\-present — Page has an h1 heading** (Headings)
  - 1 h1 found\.
- [ ] **h1\-unique — Exactly one h1 heading** (Headings)
  - The page has a single main heading, as recommended\.
- [ ] **heading\-duplicate — No duplicate heading text** (Headings)
  - 2 headings checked\.
- [ ] **heading\-empty — No empty headings** (Headings)
  - 2 headings checked\.
- [ ] **heading\-order — Heading order is logical** (Headings)
  - 2 headings analyzed with no skipped levels\.
- [ ] **hreflang\-consistency — Nothing to reconcile with the canonical** (Technical)
  - No hreflang entries are present\.
- [ ] **hreflang\-duplicates — Nothing to check for duplicates** (Technical)
  - No hreflang entries are present\.
- [ ] **hreflang\-syntax — No hreflang annotations** (Technical)
  - The page declares no <link rel="alternate" hreflang\> entries\. This is fine for single\-language sites; multi\-language sites should declare language variants\.
- [ ] **image\-alt\-empty — No empty\-alt images** (Images)
  - 1 images checked; none use the decorative empty\-alt pattern\.
- [ ] **image\-alt\-present — All images have an alt attribute** (Images)
  - 1 images checked, and every image declares an alt attribute\.
- [ ] **image\-alt\-quality — Alt text looks descriptive** (Images)
  - 1 non\-empty alt value checked; none matched filename\-like or generic patterns\.
- [ ] **image\-lazy\-loading — Lazy\-loading usage looks sensible** (Images)
  - No above\-the\-fold image is lazy\-loaded; below\-fold images use it where detected\.
- [ ] **internal\-link\-quality — Internal link anchors are descriptive** (Links)
  - 1 internal link checked; none use generic phrases like "click here" or "read more"\.
- [ ] **keyword\-in\-title — Target keyword found in the title** (Content)
  - The title contains the target keyword "fixture"\.
  - Evidence: `Vittix Real Flow Fixture Page With A Long Title`
  - Remediation: Consider working "fixture" naturally into the title, preferably near the beginning\.
- [ ] **lang\-format — Language tag format is valid** (Technical)
  - en matches the expected language\-tag shape \(e\.g\. "en", "en\-US", "zh\-Hans"\)\. Full BCP\-47 registry validation is not performed\.
- [ ] **lang\-present — Language declared** (Technical)
  - en
- [ ] **link\-anchor\-text — All links have an accessible name** (Links)
  - 1 links checked\.
- [ ] **link\-named\-nonvisually — All link names are visible as text** (Links)
  - 1 links checked; every name comes from visible text\.
- [ ] **meta\-description\-length — Meta description length is healthy** (Metadata)
  - The description is 123 characters \(target 70–160\)\.
- [ ] **meta\-description\-present — Page has a meta description** (Metadata)
  - Description length: 123 characters\.
  - Evidence: `A fixture description crafted to sit inside the healthy seventy to one hundred sixty character window used by the analyzer.`
- [ ] **og\-title\-present — Open Graph title present** (Social)
  - Vittix Real Flow Fixture
- [ ] **page\-https — Page is served over HTTPS** (Technical)
  - The page URL uses the secure https scheme\.
- [ ] **robots\-directives — No restrictive robots directives** (Technical)
  - No <meta name="robots"\> restrictions were found, so the page is indexable by default\.
- [ ] **structured\-data\-context — Nothing to check for @context/@type** (Technical)
  - No JSON\-LD blocks were present, so there is no structure to inspect\.
- [ ] **structured\-data\-valid — Nothing to validate** (Technical)
  - No JSON\-LD blocks were present, so there is no syntax to check\.
- [ ] **title\-h1\-alignment — Title and h1 are aligned** (Headings)
  - Shared terms: real, flow\.
- [ ] **title\-length — Title length is healthy** (Metadata)
  - The title is 47 characters \(target 30–60\)\.
- [ ] **title\-pixel\-width — Title pixel width is healthy** (Metadata)
  - Approximately 473px \(budget ≈580px\)\.
- [ ] **title\-present — Page has a title** (Metadata)
  - Title length: 47 characters\.
  - Evidence: `Vittix Real Flow Fixture Page With A Long Title`
- [ ] **twitter\-card\-present — twitter:card declared** (Social)
  - summary
- [ ] **twitter\-card\-valid\-type — twitter:card type is valid** (Social)
  - summary
- [ ] **url\-hygiene — URL hygiene is good** (Technical)
  - No uppercase paths, underscores, excessive length, excessive parameters or session\-style parameters detected\.
- [ ] **viewport\-present — Mobile viewport declared** (Technical)
  - width=device\-width, initial\-scale=1
- [ ] **viewport\-responsive — Viewport is responsive** (Technical)
  - The viewport uses width=device\-width and does not disable pinch zoom\.

## Ignored rules

None.

Scores are preliminary and are not ranking predictions.
