# SEO Rules — Rule Set v0.5.0

All rules are pure functions of a validated `PageSnapshot` (schema **v5**):
the same snapshot always produces the same findings, in the same order
(findings are sorted by severity, then `ruleId`). Every non-pass finding
carries `evidence` (what was found) and `remediation` (how to fix it).

Schema v5 also retains an English-heuristic syllable count and the first 100
visible body words (maximum 800 characters) locally for readability and
keyword-prominence display. The excerpt is omitted from JSON export by
default; CSV exports do not contain it.

Severities:

- `error` — clear on-page problem (score-affecting, −25)
- `warn` — likely problem (score-affecting, −10)
- `info` — contextual observation, **never score-affecting**
- `pass` — check passed, never score-affecting

## Metadata rules

| Rule                        | Severity when triggered                                                                                      | Condition                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `title-present`             | **error** if missing                                                                                         | Page has a non-empty `<title>`                                                                                                               |
| `title-duplicate`           | **error** if >1                                                                                              | Count of `<title>` elements is exactly 1                                                                                                     |
| `title-length`              | warn outside 30–60 chars                                                                                     | Title length in the healthy window                                                                                                           |
| `meta-description-present`  | **warn** if missing                                                                                          | Non-empty `meta[name=description]`                                                                                                           |
| `meta-description-multiple` | **error** if >1                                                                                              | The page declares one meta description (identical duplicates count too)                                                                      |
| `meta-description-length`   | warn outside 70–160 chars                                                                                    | Description length (only when present)                                                                                                       |
| `title-pixel-width`         | **warn** over ~580px unless the character rule already warned; info/pass otherwise                           | Estimated rendered width at 20px Arial/Roboto-like font — ±10–15% estimate (v0.4.0)                                                          |
| `description-pixel-width`   | **warn** over ~920px desktop unless char rule warned; **info** over ~680px mobile budget                     | Same estimate at 14px (v0.4.0)                                                                                                               |
| `canonical-present`         | **info** when absent                                                                                         | `<link rel="canonical">` declared                                                                                                            |
| `canonical-valid`           | **error** on relative/unparseable URLs, non-http(s) schemes, duplicate identical tags, or conflicting values | All canonical tags resolve to exactly one absolute http(s) URL — emitted as ONE finding so multiple canonical problems never stack penalties |

## Technical rules

| Rule                       | Severity when triggered                                                                                                 | Condition                                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `viewport-present`         | **warn** if missing                                                                                                     | `meta[name=viewport]` declared                                                                                         |
| `viewport-responsive`      | **warn** on fixed width (no `width=device-width`) or disabled pinch zoom (`user-scalable=no` / `maximum-scale=1`)       | Viewport content inspection (v0.3.0)                                                                                   |
| `lang-present`             | **warn** if missing                                                                                                     | `<html lang>` declared                                                                                                 |
| `lang-format`              | **warn** if the tag does not match the BCP-47 shape (e.g. `english`, `en_US`)                                           | Language-tag format check — registry validation NOT performed (v0.3.0)                                                 |
| `page-https`               | **warn** if not https                                                                                                   | Page URL uses the https scheme                                                                                         |
| `robots-directives`        | **error** on `noindex` (or `none`); **warn** on `nofollow`-only or on conflicting duplicate robots tags; pass otherwise | All `meta[name=robots]` values are reconciled (v0.3.0); indexable by default when absent                               |
| `hreflang-syntax`          | **error** on a missing href; **warn** on malformed language codes (`en_US`); pass when absent or well-formed            | `<link rel="alternate" hreflang>` entries (v0.3.0)                                                                     |
| `hreflang-duplicates`      | **warn** when a language code is declared more than once                                                                | Duplicate detection across the cluster (v0.3.0)                                                                        |
| `hreflang-consistency`     | **info** without a self-reference; **warn** when the canonical contradicts a self-referencing cluster; pass otherwise   | Evaluated within available page evidence only — cross-page return links are NOT fetched (zero-network policy) (v0.3.0) |
| `canonical-self-reference` | **warn** on cross-host canonical without hreflang; **info** for same-host variants; pass on self-reference              | Cross-host canonicals without hreflang tell engines to ignore the page (v0.5.0)                                        |
| `mixed-content`            | **warn** on http:// subresources on an https page (img/script/link/iframe, bounded sample)                              | Mixed content undermines TLS; browsers block or downgrade it (v0.5.0)                                                  |
| `favicon-present`          | **info** when absent                                                                                                    | `<link rel="icon">` declaration; browsers fall back to /favicon.ico (v0.5.0)                                           |
| `pagination-rel`           | **info** when rel=prev/next detected                                                                                    | Google no longer uses rel=prev/next for indexing — observation only (v0.5.0)                                           |
| `url-hygiene`              | **info** listing observations (uppercase path, underscores, >115 chars, >3 params, session-style params)                | Minor ranking aid; observations, never blocking (v0.5.0)                                                               |

## Social rules

| Rule                       | Severity when triggered                                  | Condition                                                           |
| -------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------- |
| `og-title-present`         | **warn** when absent (v0.4.0 — score-affecting)          | `meta[property=og:title]`                                           |
| `og-description-present`   | **info** when absent                                     | `meta[property=og:description]`                                     |
| `og-image-present`         | **warn** when absent (v0.4.0 — score-affecting)          | `meta[property=og:image]`                                           |
| `og-image-absolute-url`    | **error** when og:image is present but relative          | Some scrapers don't resolve relative og:image URLs against the page |
| `og-url-matches-canonical` | **info** when og:url absent or mismatched with canonical | og:url is the preferred URL for social scrapers                     |
| `twitter-card-present`     | **info** when absent                                     | `meta[name=twitter:card]`                                           |
| `twitter-card-valid-type`  | **warn** on unknown twitter:card value                   | Known values: summary, summary_large_image, app, player             |

## Heading rules

| Rule                 | Severity when triggered                                                                    | Condition                                                              |
| -------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `h1-present`         | **error** if none                                                                          | Zero h1 elements                                                       |
| `h1-unique`          | **error** if more than 1                                                                   | Multiple h1 elements                                                   |
| `heading-order`      | **warn** on skips or a page with no headings                                               | Levels increase one step at a time (h1→h3 is a skip)                   |
| `heading-empty`      | **warn** on empty heading elements                                                         | Headings with no text confuse the outline (v0.5.0)                     |
| `heading-duplicate`  | **info** on duplicate heading text                                                         | Common/acceptable in card grids; weak signal on content pages (v0.5.0) |
| `title-h1-alignment` | **info** when title and h1 share no meaningful content words (len > 3, stop-words removed) | Alignment reinforces topic; divergence is not wrong (v0.5.0)           |

## Content rules

| Rule               | Severity when triggered                                                                             | Condition                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `content-length`   | **warn** < 300 words on indexable pages; **info** when the text sample is truncated; never error    | Body word count — sparse page types (legal, contact) need judgment (v0.4.0) |
| `keyword-in-title` | **info** when the target keyword is missing; **pass** when present; silent without a target keyword | User-supplied target keyword, stored locally per URL (v0.5.0)               |
| `keyword-in-h1`    | **info** when the target keyword is missing from every h1; silent without a target keyword          | As above (v0.5.0)                                                           |

## Image rules (three separate concerns — an image is never penalized twice)

| Rule                       | Severity when triggered                                                                | Condition                                                                                                                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `image-alt-present`        | **error** if any `<img>` has NO alt attribute                                          | The attribute itself is missing (screen readers fall back to the filename)                                                                                                                                               |
| `image-alt-empty`          | **info** when present                                                                  | Explicitly empty `alt=""` is the CORRECT pattern for decorative images — observation only, never a fault                                                                                                                 |
| `image-alt-quality`        | **warn** on suspicious patterns                                                        | Non-empty alt that looks like a filename (`photo1.png`), a generic label (`image`, `logo`, `icon`, …), or is < 4 characters. Hedged on purpose: Vittix classifies text patterns and **does not understand image intent** |
| `image-dimensions-missing` | **warn**, ratio-scaled                                                                 | Content `<img>` without width/height attributes — layout-shift (CLS) risk. Markup heuristic, not a measured performance result                                                                                           |
| `image-lazy-loading`       | **warn** on lazy above-fold candidate; **info** for below-fold candidates without lazy | Above-fold detection is a bounded viewport heuristic (first 20 images at extraction), not a lab measurement                                                                                                              |
| `image-modern-format`      | **info** on legacy jpg/png/gif/bmp without `<picture>`/srcset                          | Source-extension heuristic — servers can serve modern formats from .jpg URLs; a lead, not a verdict                                                                                                                      |
| `image-srcset-missing`     | **info** for images declared ≥ 400px wide without srcset                               | Only images with an explicit width attribute are assessed                                                                                                                                                                |

## Link rules

**Classification policy (v0.4.0):** links are bucketed as
`internal` / `external` / `other`.

- **internal** — http(s) links whose host equals the page host after stripping
  a single leading `www.` from BOTH hosts (`www.example.com` ≡ `example.com`).
  Other subdomains (`cdn.example.com`) are **external**.
- **external** — http(s) links to any other host.
- **other** — non-http(s) schemes (`mailto:`, `tel:`, `sms:`, `javascript:`,
  `data:`) and pure in-page fragments (`#…`). Excluded from internal/external
  counts, the nofollow tally and the generic-anchor check — but a **nameless
  `mailto:`/`tel:` link is still an accessibility error** (the
  `link-anchor-text` check covers every link).

| Rule                     | Severity when triggered                      | Condition                                                                                                                                                                                             |
| ------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `link-anchor-text`       | **error** if any link has NO accessible name | Accessible name = aria-labelledby → aria-label → visible text → descendant img alt → descendant svg title/aria-label (multiple IDREFs joined in reference order). Covers ALL links incl. mailto:/tel: |
| `link-named-nonvisually` | **info** when present                        | Links named only via aria-label, aria-labelledby, or image/svg alt (valid for icon links) — never score-affecting                                                                                     |
| `internal-link-quality`  | **warn** on generic internal anchors         | Internal http(s) links whose accessible name is "click here", "read more", "learn more", "here", "this page", "this link", "details", "continue" or "more" (external and `other` links exempt)        |
| `link-profile`           | always `info`                                | Bucketed counts: `N internal · M external · K mailto/tel/other`, nofollow count (http(s) only), truncation note                                                                                       |

## Structured data rules (JSON-LD + Microdata/RDFa detection)

| Rule                                | Severity when triggered                                                               | Condition                                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `structured-data-present`           | **info** when absent; pass with detected `@type`s when present                        | `<script type="application/ld+json">` blocks (up to 5 retained)                                                                                                     |
| `structured-data-valid`             | **error** if any block fails `JSON.parse`                                             | SYNTAX check only. Blocks that parse are NOT claimed to be schema.org-valid — vocabulary validity is explicitly out of scope                                        |
| `structured-data-context`           | **warn** on parsed blocks missing `@context` or `@type`                               | Basic structural check incl. `@graph` containers — NOT schema.org or rich-result validation (v0.3.0)                                                                |
| `structured-data-type-detected`     | **pass** listing recognized types; **info** when none recognized                      | Recognized registry: Article, NewsArticle, BlogPosting, Product, FAQPage, BreadcrumbList, Organization, LocalBusiness, WebSite, Recipe, Event, VideoObject (v0.5.0) |
| `structured-data-required-props`    | **warn** when a recognized type is missing required properties (one finding per type) | Static in-repo registry based on Google's documented requirements as of 2026-11 — may change; passing does NOT guarantee rich results (v0.5.0)                      |
| `structured-data-recommended-props` | **info** when recommended properties are missing                                      | Same registry; enrich results but not disqualifying (v0.5.0)                                                                                                        |

Also **detected-types only** (no validation) for Microdata (`itemscope`/`itemtype`) and RDFa (`typeof`), reported in the snapshot's `microdataRdfaTypes` (bounded to 10).

## Scoring

### Profiles (A7)

Profiles change category weights deterministically; weights always sum to 100.
Per-origin ignored rule IDs and severity overrides layer on the selected
profile. Ignored findings remain visible in gray and do not affect category
scores or caps.

| Profile           | Metadata | Headings | Images | Links | Content | Social | Technical | Built-in ignored rules                          | Blocking cap |
| ----------------- | -------: | -------: | -----: | ----: | ------: | -----: | --------: | ----------------------------------------------- | ------------ |
| Standard          |       25 |       20 |     15 |    15 |      10 |     10 |         5 | none                                            | enforced     |
| Content site      |       20 |       20 |     10 |    10 |      25 |     10 |         5 | none                                            | enforced     |
| E-commerce        |       20 |       15 |     15 |    10 |      10 |     10 |        20 | none                                            | enforced     |
| Developer/staging |       25 |       20 |     15 |    15 |      15 |      0 |        10 | all social rules, `page-https`, `mixed-content` | relaxed      |

The e-commerce profile increases technical weight because Product structured
data checks are reported in the technical category. Developer/staging relaxes
the noindex score cap because staging pages are intentionally marked noindex;
all other profiles retain the blocking cap. An explicit severity override on
a blocking rule may also change whether the cap applies, and the UI warns
before saving that override.

Formula (rule set v0.5.0):

1. Each category starts at **100**.
2. Only `error` (−25) and `warn` (−10) deduct. `info`/`pass` never do
   (`SCORE_AFFECTING_SEVERITIES = ['error', 'warn']`).
3. **Ratio scaling (v0.4.0)** — count-based rules (`image-alt-present`,
   `image-alt-quality`, `link-anchor-text`, `internal-link-quality`) emit an
   `affected/checked` ratio. When the affected fraction is **< 10%**, the
   penalty drops one tier (error 25 → 10, warn 10 → 5): one missing alt out
   of 200 images is a blemish, not a structural failure. Rules without a
   ratio keep the flat penalty.
4. Each rule penalizes **once per category** — findings sharing a ruleId are
   deduplicated, so one underlying issue can never be counted twice.
5. Category scores floor at **0**.
6. **Blocking-issue cap (v0.4.0)** — an `error` from a rule that prevents
   indexing or meaningful evaluation (`robots-directives` noindex/none,
   `title-present` missing, `h1-present` missing, `canonical-valid` error)
   caps the **total** at **49** (label forced to "Poor") and sets
   `Score.capReason`. Rationale: a page a search engine cannot index should
   never look "average" no matter how polished the remaining signals are —
   a flat −25 on a weight-5 technical category cost a noindex page only
   ~1.25 points, which understated a release-blocking fault.
7. Total = `round(Σ categoryScore × weight) / 100`; weights sum to 100.

| Category  | Weight |
| --------- | ------ |
| metadata  | 30     |
| headings  | 20     |
| images    | 20     |
| links     | 15     |
| social    | 10     |
| technical | 5      |

**Social category reasoning (v0.4.0):** previously every social rule was
informational, so the category was always 100 and handed every page 10 free
points. Missing `og:title` / `og:image` are now **warn** (score-affecting):
social previews materially affect click-through on shared links.
`og:description` and `twitter:card` remain informational.

Worked example (non-blocking): one metadata warn (−10) + one headings warn
(−10) + one images error (−25) + one links error (−25) + one technical warn
(−10) → metadata 90 · headings 90 · images 75 · links 75 · social 100 ·
technical 90 → (90×30 + 90×20 + 75×20 + 75×15 + 100×10 + 90×5)/100 =
**83** (Good).

Blocking example: `robots-directives` noindex (−25 on technical → 75) but
the cap forces the **total to 49 (Poor)** with
`capReason: "Score capped at 49 — blocking issues: robots-directives"`.

Labels: ≥90 Excellent · ≥75 Good · ≥50 Needs work · <50 Poor. A capped
score always reports "Poor".

> **Preliminary by construction.** `Score.preliminary` is the literal `true`
> in the schema, so every UI rendering a score also renders the
> "preliminary" label. The score measures on-page hygiene captured in the
> snapshot only. It is **not** a search-ranking prediction and has no known
> relationship to Google rankings.
>
> **Incomplete audits.** When extraction caps truncate any collection
> (headings > 300, images/links > 500, JSON-LD > 5, text sample > 100 kB),
> `result.truncated` is `true` and the UI/export reflect it — scores from
> partial data may undercount.
>
> Scoring changes are gated by regression tests (`scoring.test.ts`); any
> intentional change must update the expected values AND this document in
> the same commit and bump `RULE_SET_VERSION`.

## Known limitations (Phase 2)

- stylesheet-driven hiding (CSS files/classes) is not detected per element;
  only `[hidden]`, `aria-hidden="true"` ancestors and inline
  `display:none`/`visibility:hidden` are treated as hidden (documented,
  deterministic subset)
- hreflang cross-page return links are NOT verified (would require fetching
  other URLs — excluded by the zero-network policy)
- iframes are not analyzed (extraction targets the top frame only)
- SPAs are analyzed at click time (live DOM ground truth); no continuous
  monitoring by design — use Re-analyze after client-side navigation
- JSON-LD `@graph` types are summarized, not fully enumerated
- extraction caps (all reported per-collection in `omitted`): 300 headings /
  500 images / 500 links / 5 JSON-LD blocks / 5 description, canonical,
  robots & hreflang values
