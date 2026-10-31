import type { Finding, PageSnapshot } from '@vittix/shared';
import { DESCRIPTION_LENGTH_BOUNDS, LANG_TAG_PATTERN, TITLE_LENGTH_BOUNDS } from '../rules.js';
import { finding } from './util.js';

/**
 * Metadata, technical and social rules. All checks are plain string
 * inspections of the snapshot — no network requests, no fetching of
 * referenced resources.
 */
export function analyzeMetadata(snapshot: PageSnapshot): Finding[] {
  return [
    ...titleRules(snapshot),
    ...descriptionRules(snapshot),
    ...canonicalRules(snapshot),
    ...technicalRules(snapshot),
    ...socialRules(snapshot),
  ];
}

function titleRules(snapshot: PageSnapshot): Finding[] {
  const findings: Finding[] = [];
  const title = snapshot.title.trim();

  if (title.length === 0) {
    findings.push(
      finding(
        'title-present',
        'metadata',
        'error',
        'Page has no title',
        'Every page needs a unique, descriptive <title> element. It is the strongest on-page SEO signal and the primary search-result headline.',
        {
          remediation:
            'Add exactly one <title> element in <head> describing the page in roughly 30–60 characters.',
        },
      ),
    );
  } else {
    findings.push(
      finding(
        'title-present',
        'metadata',
        'pass',
        'Page has a title',
        `Title length: ${title.length} characters.`,
        {
          evidence: title,
        },
      ),
    );
  }

  if (snapshot.titleCount > 1) {
    findings.push(
      finding(
        'title-duplicate',
        'metadata',
        'error',
        'Multiple <title> elements',
        `${snapshot.titleCount} <title> tags were found. Browsers use the first one, but search engines may treat the duplication as sloppy markup and it usually signals a templating bug.`,
        {
          remediation: `Remove ${snapshot.titleCount - 1} <title> element(s) so exactly one remains in <head>.`,
        },
      ),
    );
  }

  if (title.length > 0) {
    if (title.length < TITLE_LENGTH_BOUNDS.min) {
      findings.push(
        finding(
          'title-length',
          'metadata',
          'warn',
          'Title is very short',
          `The title is ${title.length} characters. Titles between ${TITLE_LENGTH_BOUNDS.min} and ${TITLE_LENGTH_BOUNDS.max} characters carry more descriptive weight and are less likely to be rewritten by search engines.`,
          {
            evidence: title,
            remediation: `Expand the title toward ${TITLE_LENGTH_BOUNDS.min}–${TITLE_LENGTH_BOUNDS.max} characters with the page's primary topic and brand.`,
          },
        ),
      );
    } else if (title.length > TITLE_LENGTH_BOUNDS.max) {
      findings.push(
        finding(
          'title-length',
          'metadata',
          'warn',
          'Title may be truncated in search results',
          `The title is ${title.length} characters. Search results typically display roughly the first ${TITLE_LENGTH_BOUNDS.max} characters.`,
          {
            evidence: title,
            remediation: `Trim the title to ${TITLE_LENGTH_BOUNDS.max} characters or fewer, front-loading the most important words.`,
          },
        ),
      );
    } else {
      findings.push(
        finding(
          'title-length',
          'metadata',
          'pass',
          'Title length is healthy',
          `The title is ${title.length} characters (target ${TITLE_LENGTH_BOUNDS.min}–${TITLE_LENGTH_BOUNDS.max}).`,
        ),
      );
    }
  }

  return findings;
}

function descriptionRules(snapshot: PageSnapshot): Finding[] {
  const findings: Finding[] = [];
  const description = snapshot.meta.description?.trim() ?? '';

  if (description.length === 0) {
    findings.push(
      finding(
        'meta-description-present',
        'metadata',
        'warn',
        'Page has no meta description',
        'Without a meta description, search engines generate their own snippet. A well-written description improves click-through rates.',
        {
          remediation:
            'Add a single <meta name="description" content="…"> of 70–160 characters summarizing the page.',
        },
      ),
    );
  } else {
    findings.push(
      finding(
        'meta-description-present',
        'metadata',
        'pass',
        'Page has a meta description',
        `Description length: ${description.length} characters.`,
        {
          evidence: description,
        },
      ),
    );
  }

  if (snapshot.descriptions.length > 1) {
    const distinct = new Set(snapshot.descriptions.map((value) => value.trim())).size;
    findings.push(
      finding(
        'meta-description-multiple',
        'metadata',
        'error',
        'Multiple meta description tags',
        `${snapshot.descriptions.length} <meta name="description"> tags were found (${distinct} distinct value${distinct === 1 ? '' : 's'}). Search engines pick one unpredictably when several compete.`,
        {
          evidence: snapshot.descriptions.slice(0, 2).join(' | ').slice(0, 300),
          remediation:
            'Keep a single meta description tag and remove the duplicates from templates or plugins.',
        },
      ),
    );
  }

  if (description.length > 0) {
    if (description.length < DESCRIPTION_LENGTH_BOUNDS.min) {
      findings.push(
        finding(
          'meta-description-length',
          'metadata',
          'warn',
          'Meta description is very short',
          `The description is ${description.length} characters. Aim for ${DESCRIPTION_LENGTH_BOUNDS.min}–${DESCRIPTION_LENGTH_BOUNDS.max} characters to use the available snippet space.`,
          {
            remediation: `Expand the description toward ${DESCRIPTION_LENGTH_BOUNDS.min}–${DESCRIPTION_LENGTH_BOUNDS.max} characters with concrete page content.`,
          },
        ),
      );
    } else if (description.length > DESCRIPTION_LENGTH_BOUNDS.max) {
      findings.push(
        finding(
          'meta-description-length',
          'metadata',
          'warn',
          'Meta description may be truncated',
          `The description is ${description.length} characters. Snippets typically show roughly the first ${DESCRIPTION_LENGTH_BOUNDS.max} characters.`,
          {
            remediation: `Tighten the description to ${DESCRIPTION_LENGTH_BOUNDS.max} characters or fewer, leading with the main value proposition.`,
          },
        ),
      );
    } else {
      findings.push(
        finding(
          'meta-description-length',
          'metadata',
          'pass',
          'Meta description length is healthy',
          `The description is ${description.length} characters (target ${DESCRIPTION_LENGTH_BOUNDS.min}–${DESCRIPTION_LENGTH_BOUNDS.max}).`,
        ),
      );
    }
  }

  return findings;
}

function canonicalRules(snapshot: PageSnapshot): Finding[] {
  const findings: Finding[] = [];
  const canonicals = snapshot.canonicals.filter((value) => value.trim() !== '');

  if (canonicals.length === 0) {
    findings.push(
      finding(
        'canonical-present',
        'metadata',
        'info',
        'No canonical URL declared',
        'A <link rel="canonical"> tells search engines which URL is the primary version. Missing one is not necessarily an error, but it matters on pages with URL variants (parameters, pagination, syndication).',
        {
          remediation:
            'If this page has URL variants, add <link rel="canonical" href="…"> pointing at the preferred absolute URL.',
        },
      ),
    );
    return findings;
  }

  findings.push(
    finding(
      'canonical-present',
      'metadata',
      'pass',
      'Canonical URL declared',
      'The page declares a canonical URL.',
      {
        evidence: snapshot.meta.canonical ?? canonicals[0],
      },
    ),
  );

  // Validity: relative/unparseable, duplicates, conflicts — ONE finding so a
  // page with several canonical problems is not penalized multiple times.
  const issues: string[] = [];
  let severity: 'error' | 'warn' | 'pass' = 'pass';

  for (const canonical of canonicals) {
    let absolute: URL | null = null;
    try {
      absolute = new URL(canonical);
    } catch {
      issues.push(`relative or unparseable (${canonical.slice(0, 80)})`);
      severity = 'error';
      continue;
    }
    if (absolute.protocol !== 'http:' && absolute.protocol !== 'https:') {
      issues.push(`non-http(s) scheme (${canonical.slice(0, 80)})`);
      severity = 'error';
    }
  }

  const distinct = new Set(canonicals.map((value) => value.trim()));
  if (canonicals.length > 1 && distinct.size < canonicals.length) {
    issues.push('duplicate canonical tags with identical values');
    severity = 'error';
  } else if (distinct.size > 1) {
    issues.push(`${distinct.size} conflicting canonical URLs`);
    severity = 'error';
  }

  if (issues.length > 0) {
    findings.push(
      finding(
        'canonical-valid',
        'metadata',
        severity,
        'Canonical URL problems',
        'Canonical tags must point at a single absolute http(s) URL. Relative, duplicated or conflicting canonicals send mixed signals to search engines.',
        {
          evidence:
            issues.slice(0, 3).join('; ') +
            (issues.length > 3 ? ` … (${issues.length} issues)` : ''),
          remediation:
            'Keep exactly one <link rel="canonical"> with an absolute https:// URL of the preferred page version.',
        },
      ),
    );
  } else {
    findings.push(
      finding(
        'canonical-valid',
        'metadata',
        'pass',
        'Canonical URL is valid',
        'The canonical is a single absolute http(s) URL.',
      ),
    );
  }

  return findings;
}

function technicalRules(snapshot: PageSnapshot): Finding[] {
  const findings: Finding[] = [];

  const viewport = snapshot.meta.viewport?.trim() ?? '';
  if (viewport === '') {
    findings.push(
      finding(
        'viewport-present',
        'technical',
        'warn',
        'No mobile viewport declared',
        'A <meta name="viewport"> is required for mobile-friendly rendering. Pages without it are considered non-mobile-friendly.',
        {
          remediation:
            'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to <head>.',
        },
      ),
    );
    findings.push(
      finding(
        'viewport-responsive',
        'technical',
        'pass',
        'Viewport content not assessable',
        'No viewport meta is declared, so there is no content to inspect.',
      ),
    );
  } else {
    findings.push(
      finding('viewport-present', 'technical', 'pass', 'Mobile viewport declared', viewport),
    );
    // Inspect the declared content: responsive pages should use
    // width=device-width. Fixed widths and user-scalable=no are flagged.
    const lower = viewport.toLowerCase();
    const hasDeviceWidth = /width\s*=\s*device-width/i.test(lower);
    const hasFixedWidth = /width\s*=\s*\d/i.test(lower);
    const pinchDisabled =
      /user-scalable\s*=\s*no/i.test(lower) || /maximum-scale\s*=\s*1(\.0+)?(\s|,|$)/i.test(lower);
    if (hasDeviceWidth && !pinchDisabled) {
      findings.push(
        finding(
          'viewport-responsive',
          'technical',
          'pass',
          'Viewport is responsive',
          'The viewport uses width=device-width and does not disable pinch zoom.',
        ),
      );
    } else if (hasFixedWidth || !hasDeviceWidth) {
      findings.push(
        finding(
          'viewport-responsive',
          'technical',
          'warn',
          'Viewport is not responsive',
          `The viewport "${viewport}" does not use width=device-width; mobile browsers must scale a fixed layout, which typically fails mobile usability checks.`,
          {
            evidence: viewport,
            remediation:
              'Change the viewport to <meta name="viewport" content="width=device-width, initial-scale=1">.',
          },
        ),
      );
    } else {
      findings.push(
        finding(
          'viewport-responsive',
          'technical',
          'warn',
          'Pinch zoom is disabled',
          'The viewport disables user scaling (user-scalable=no or maximum-scale=1), which harms accessibility and is treated as a mobile-friendliness failure by search engines.',
          {
            evidence: viewport,
            remediation:
              'Remove user-scalable=no / maximum-scale=1 from the viewport so users can zoom.',
          },
        ),
      );
    }
  }

  const lang = snapshot.meta.lang?.trim() ?? '';
  if (lang === '') {
    findings.push(
      finding(
        'lang-present',
        'technical',
        'warn',
        'No language declared',
        'The <html lang> attribute helps search engines and assistive technology identify the page language.',
        {
          remediation: 'Set the page language, e.g. <html lang="en">.',
        },
      ),
    );
    findings.push(
      finding(
        'lang-format',
        'technical',
        'pass',
        'Language format not assessable',
        'No lang attribute is declared, so there is no format to validate.',
      ),
    );
  } else if (LANG_TAG_PATTERN.test(lang)) {
    findings.push(finding('lang-present', 'technical', 'pass', 'Language declared', lang));
    findings.push(
      finding(
        'lang-format',
        'technical',
        'pass',
        'Language tag format is valid',
        `${lang} matches the expected language-tag shape (e.g. "en", "en-US", "zh-Hans"). Full BCP-47 registry validation is not performed.`,
      ),
    );
  } else {
    findings.push(finding('lang-present', 'technical', 'pass', 'Language declared', lang));
    findings.push(
      finding(
        'lang-format',
        'technical',
        'warn',
        'Language tag looks malformed',
        `"${lang}" does not match the expected language-tag shape (2–3 letter code, optionally followed by script/region subtags, e.g. "en", "en-US", "zh-Hans"). Values like "english" or "en_US" are not valid language tags.`,
        {
          evidence: lang,
          remediation:
            'Use a valid BCP-47 language tag, e.g. <html lang="en"> or <html lang="en-US"> (hyphen, not underscore).',
        },
      ),
    );
  }

  if (!snapshot.url.toLowerCase().startsWith('https://')) {
    findings.push(
      finding(
        'page-https',
        'technical',
        'warn',
        'Page is not served over HTTPS',
        'HTTPS is a ranking signal and a browser security requirement. This page URL uses an insecure scheme.',
        {
          evidence: snapshot.url,
          remediation: 'Serve the page over HTTPS and redirect http:// requests to https://.',
        },
      ),
    );
  } else {
    findings.push(
      finding(
        'page-https',
        'technical',
        'pass',
        'Page is served over HTTPS',
        'The page URL uses the secure https scheme.',
      ),
    );
  }

  // Robots directives — reconcile ALL meta[name=robots] tags (v3 extraction
  // collects every value). Conflicting duplicate tags are flagged before the
  // effective-directive evaluation.
  const robotsValues = (
    snapshot.robotsValues.length > 0
      ? snapshot.robotsValues
      : snapshot.meta.robots
        ? [snapshot.meta.robots]
        : []
  ).map((value) => value.trim());

  const distinctRobots = new Set(robotsValues.map((value) => value.toLowerCase()));
  if (robotsValues.length > 1 && distinctRobots.size > 1) {
    findings.push(
      finding(
        'robots-directives',
        'technical',
        'warn',
        'Conflicting robots meta tags',
        `${robotsValues.length} <meta name="robots"> tags declare different directives (${robotsValues
          .slice(0, 2)
          .map((value) => `"${value.slice(0, 40)}"`)
          .join(
            ' vs ',
          )}). Search engines merge directives unpredictably — most lenient value usually wins, which is rarely what the author intended.`,
        {
          evidence: robotsValues.join(' | ').slice(0, 300),
          remediation:
            'Keep a single <meta name="robots"> tag per page and reconcile the values across templates and plugins.',
        },
      ),
    );
  }

  const robots = (snapshot.meta.robots ?? '').toLowerCase();
  if (robots === '') {
    findings.push(
      finding(
        'robots-directives',
        'technical',
        'pass',
        'No restrictive robots directives',
        'No <meta name="robots"> restrictions were found, so the page is indexable by default.',
      ),
    );
  } else {
    const noindex = /\bnoindex\b/.test(robots) || /\bnone\b/.test(robots);
    const nofollow = /\bnofollow\b/.test(robots) || /\bnone\b/.test(robots);
    if (noindex) {
      findings.push(
        finding(
          'robots-directives',
          'technical',
          'error',
          'Page is blocked from indexing (noindex)',
          'The robots meta directive tells search engines not to index this page. If this is unintentional, the page cannot appear in search results.',
          {
            evidence: snapshot.meta.robots ?? undefined,
            remediation:
              'If this page should be indexable, remove noindex/none from <meta name="robots"> (check for settings left over from a staging environment).',
          },
        ),
      );
    } else if (nofollow) {
      findings.push(
        finding(
          'robots-directives',
          'technical',
          'warn',
          'nofollow directive on the page',
          'The robots meta directive contains nofollow: search engines will not follow the links on this page, which blocks link equity flow.',
          {
            evidence: snapshot.meta.robots ?? undefined,
            remediation:
              'Unless intentional, remove nofollow from <meta name="robots"> so links on this page can be followed.',
          },
        ),
      );
    } else {
      findings.push(
        finding(
          'robots-directives',
          'technical',
          'pass',
          'No restrictive robots directives',
          `Robots meta is present but indexable: ${snapshot.meta.robots}`,
        ),
      );
    }
  }

  return findings;
}

function socialRules(snapshot: PageSnapshot): Finding[] {
  const findings: Finding[] = [];

  const ogTitle = snapshot.meta.ogTitle?.trim() ?? '';
  if (ogTitle === '') {
    findings.push(
      finding(
        'og-title-present',
        'social',
        // Warn (score-affecting) since v0.4.0: social previews materially
        // affect click-through; og:description/twitter:card stay informational.
        'warn',
        'No Open Graph title',
        'og:title controls how the page appears when shared on social platforms. Optional for search rankings, valuable for click-through from social.',
        {
          remediation: 'Add <meta property="og:title" content="…"> with the page headline.',
        },
      ),
    );
  } else {
    findings.push(
      finding('og-title-present', 'social', 'pass', 'Open Graph title present', ogTitle),
    );
  }

  const ogDescription = snapshot.meta.ogDescription?.trim() ?? '';
  if (ogDescription === '') {
    findings.push(
      finding(
        'og-description-present',
        'social',
        'info',
        'No Open Graph description',
        'og:description summarizes the page for social shares. Optional for search rankings, valuable for click-through from social.',
        {
          remediation: 'Add <meta property="og:description" content="…"> summarizing the page.',
        },
      ),
    );
  } else {
    findings.push(
      finding(
        'og-description-present',
        'social',
        'pass',
        'Open Graph description present',
        ogDescription,
      ),
    );
  }

  const ogImage = snapshot.meta.ogImage?.trim() ?? '';
  if (ogImage === '') {
    findings.push(
      finding(
        'og-image-present',
        'social',
        // Warn (score-affecting) since v0.4.0 — see og:title note above.
        'warn',
        'No Open Graph image',
        'og:image is the preview image for social shares. Pages without one render a blank or generic preview.',
        {
          remediation:
            'Add <meta property="og:image" content="https://…"> with an absolute image URL (1200×630 works well).',
        },
      ),
    );
  } else {
    findings.push(
      finding('og-image-present', 'social', 'pass', 'Open Graph image present', ogImage),
    );
  }

  const twitterCard = snapshot.meta.twitterCard?.trim() ?? '';
  if (twitterCard === '') {
    findings.push(
      finding(
        'twitter-card-present',
        'social',
        'info',
        'No twitter:card',
        'twitter:card selects the link-preview layout on X/Twitter. Without it, the platform guesses (usually a plain summary card).',
        {
          remediation:
            'Add <meta name="twitter:card" content="summary_large_image"> (or "summary").',
        },
      ),
    );
  } else {
    findings.push(
      finding('twitter-card-present', 'social', 'pass', 'twitter:card declared', twitterCard),
    );
  }

  return findings;
}
