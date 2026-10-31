# SEO Rules — Rule Set v0.3.0

All rules are pure functions of a validated `PageSnapshot` (schema **v3**):
the same snapshot always produces the same findings, in the same order
(findings are sorted by severity, then `ruleId`). Every non-pass finding
carries `evidence` (what was found) and `remediation` (how to fix it).

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
| `canonical-present`         | **info** when absent                                                                                         | `<link rel="canonical">` declared                                                                                                            |
| `canonical-valid`           | **error** on relative/unparseable URLs, non-http(s) schemes, duplicate identical tags, or conflicting values | All canonical tags resolve to exactly one absolute http(s) URL — emitted as ONE finding so multiple canonical problems never stack penalties |

## Technical rules

| Rule                   | Severity when triggered                                                                                                 | Condition                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `viewport-present`     | **warn** if missing                                                                                                     | `meta[name=viewport]` declared                                                                                         |
| `viewport-responsive`  | **warn** on fixed width (no `width=device-width`) or disabled pinch zoom (`user-scalable=no` / `maximum-scale=1`)       | Viewport content inspection (v0.3.0)                                                                                   |
| `lang-present`         | **warn** if missing                                                                                                     | `<html lang>` declared                                                                                                 |
| `lang-format`          | **warn** if the tag does not match the BCP-47 shape (e.g. `english`, `en_US`)                                           | Language-tag format check — registry validation NOT performed (v0.3.0)                                                 |
| `page-https`           | **warn** if not https                                                                                                   | Page URL uses the https scheme                                                                                         |
| `robots-directives`    | **error** on `noindex` (or `none`); **warn** on `nofollow`-only or on conflicting duplicate robots tags; pass otherwise | All `meta[name=robots]` values are reconciled (v0.3.0); indexable by default when absent                               |
| `hreflang-syntax`      | **error** on a missing href; **warn** on malformed language codes (`en_US`); pass when absent or well-formed            | `<link rel="alternate" hreflang>` entries (v0.3.0)                                                                     |
| `hreflang-duplicates`  | **warn** when a language code is declared more than once                                                                | Duplicate detection across the cluster (v0.3.0)                                                                        |
| `hreflang-consistency` | **info** without a self-reference; **warn** when the canonical contradicts a self-referencing cluster; pass otherwise   | Evaluated within available page evidence only — cross-page return links are NOT fetched (zero-network policy) (v0.3.0) |

## Social rules (all informational when absent)

| Rule                     | Severity when triggered | Condition                       |
| ------------------------ | ----------------------- | ------------------------------- |
| `og-title-present`       | **info** when absent    | `meta[property=og:title]`       |
| `og-description-present` | **info** when absent    | `meta[property=og:description]` |
| `og-image-present`       | **info** when absent    | `meta[property=og:image]`       |
| `twitter-card-present`   | **info** when absent    | `meta[name=twitter:card]`       |

## Heading rules

| Rule            | Severity when triggered                      | Condition                                            |
| --------------- | -------------------------------------------- | ---------------------------------------------------- |
| `h1-present`    | **error** if none                            | Zero h1 elements                                     |
| `h1-unique`     | **error** if more than 1                     | Multiple h1 elements                                 |
| `heading-order` | **warn** on skips or a page with no headings | Levels increase one step at a time (h1→h3 is a skip) |

## Image rules (three separate concerns — an image is never penalized twice)

| Rule                | Severity when triggered                       | Condition                                                                                                                                                                                                                |
| ------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `image-alt-present` | **error** if any `<img>` has NO alt attribute | The attribute itself is missing (screen readers fall back to the filename)                                                                                                                                               |
| `image-alt-empty`   | **info** when present                         | Explicitly empty `alt=""` is the CORRECT pattern for decorative images — observation only, never a fault                                                                                                                 |
| `image-alt-quality` | **warn** on suspicious patterns               | Non-empty alt that looks like a filename (`photo1.png`), a generic label (`image`, `logo`, `icon`, …), or is < 4 characters. Hedged on purpose: Vittix classifies text patterns and **does not understand image intent** |

## Link rules

| Rule                     | Severity when triggered                      | Condition                                                                                                                                                                                     |
| ------------------------ | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `link-anchor-text`       | **error** if any link has NO accessible name | Accessible name = aria-labelledby → aria-label → visible text → descendant img alt → descendant svg title/aria-label (v0.3.0 resolution order; multiple IDREFs are joined in reference order) |
| `link-named-nonvisually` | **info** when present                        | Links named only via aria-label, aria-labelledby, or image/svg alt (valid for icon links) — never score-affecting                                                                             |
| `internal-link-quality`  | **warn** on generic internal anchors         | Internal links whose accessible name is "click here", "read more", "learn more", "here", "this page", "this link", "details", "continue" or "more" (v0.3.0; external links are exempt)        |
| `link-profile`           | always `info`                                | Internal/external counts (resolved against the page URL), nofollow count, unresolvable hrefs, truncation note                                                                                 |

## Structured data rules (JSON-LD)

| Rule                      | Severity when triggered                                        | Condition                                                                                                                    |
| ------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `structured-data-present` | **info** when absent; pass with detected `@type`s when present | `<script type="application/ld+json">` blocks (up to 5 retained)                                                              |
| `structured-data-valid`   | **error** if any block fails `JSON.parse`                      | SYNTAX check only. Blocks that parse are NOT claimed to be schema.org-valid — vocabulary validity is explicitly out of scope |
| `structured-data-context` | **warn** on parsed blocks missing `@context` or `@type`        | Basic structural check incl. `@graph` containers — NOT schema.org or rich-result validation (v0.3.0)                         |

## Scoring

Formula (rule set v0.3.0):

1. Each category starts at **100**.
2. Only `error` (−25) and `warn` (−10) deduct. `info`/`pass` never do
   (`SCORE_AFFECTING_SEVERITIES = ['error', 'warn']`).
3. Each rule penalizes **once per category** — findings sharing a ruleId are
   deduplicated, so one underlying issue can never be counted twice.
4. Category scores floor at **0**.
5. Total = `round(Σ categoryScore × weight) / 100`; weights sum to 100.

| Category  | Weight |
| --------- | ------ |
| metadata  | 30     |
| headings  | 20     |
| images    | 20     |
| links     | 15     |
| social    | 10     |
| technical | 5      |

Worked example: one metadata warn (−10) + one headings error (−25) +
one images error (−25) + one links error (−25) + one technical warn (−10) →
metadata 90 · headings 75 · images 75 · links 75 · social 100 · technical 90 →
(90×30 + 75×20 + 75×20 + 75×15 + 100×10 + 90×5)/100 = **84** (Good).

Labels: ≥90 Excellent · ≥75 Good · ≥50 Needs work · <50 Poor.

> **Preliminary by construction.** `Score.preliminary` is the literal `true`
> in the schema, so every UI rendering a score also renders the
> "preliminary" label. The score measures on-page hygiene captured in the
> snapshot only. It is **not** a search-ranking prediction and has no known
> relationship to Google rankings.
>
> **Incomplete audits.** When extraction caps truncate any collection
> (headings > 300, images/links > 500, JSON-LD > 5), `result.truncated` is
> `true` and the UI/export reflect it — scores from partial data may
> undercount.
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
