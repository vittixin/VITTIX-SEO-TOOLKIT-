import { describe, expect, it } from 'vitest';
import { analyzeMetadata } from './analyzers/metadata.js';
import { analyzeHeadings } from './analyzers/headings.js';
import { analyzeImages } from './analyzers/images.js';
import { analyzeLinks } from './analyzers/links.js';
import { analyzeStructuredData } from './analyzers/structured-data.js';
import { analyzeHreflang } from './analyzers/hreflang.js';
import { buildSnapshot, findByRuleId } from './testing/fixtures.js';

describe('analyzeMetadata — title rules', () => {
  it('passes a healthy metadata page (no error/warn findings)', () => {
    const findings = analyzeMetadata(buildSnapshot());
    const problems = findings.filter((f) => f.severity === 'error' || f.severity === 'warn');
    expect(problems).toEqual([]);
    expect(findings.map((f) => f.ruleId)).toContain('title-present');
    expect(findings.map((f) => f.ruleId)).toContain('canonical-present');
    expect(findings.map((f) => f.ruleId)).toContain('page-https');
  });

  it('flags a missing title as an error with remediation', () => {
    const findings = analyzeMetadata(buildSnapshot({ title: '   ' }));
    const finding = findByRuleId(findings, 'title-present');
    expect(finding.severity).toBe('error');
    expect(finding.remediation).toBeTruthy();
  });

  it('errors on duplicate <title> elements', () => {
    const findings = analyzeMetadata(buildSnapshot({ titleCount: 3 }));
    expect(findByRuleId(findings, 'title-duplicate').severity).toBe('error');
  });

  it('does not emit title-duplicate for a single title', () => {
    const findings = analyzeMetadata(buildSnapshot());
    expect(findings.some((f) => f.ruleId === 'title-duplicate')).toBe(false);
  });

  it('warns on a too-short title', () => {
    const findings = analyzeMetadata(buildSnapshot({ title: 'Short' }));
    expect(findByRuleId(findings, 'title-length').severity).toBe('warn');
  });

  it('warns on a too-long title', () => {
    const findings = analyzeMetadata(buildSnapshot({ title: 'x'.repeat(61) }));
    expect(findByRuleId(findings, 'title-length').severity).toBe('warn');
  });

  it('passes a title at both boundary lengths', () => {
    for (const title of ['a'.repeat(30), 'b'.repeat(60)]) {
      const findings = analyzeMetadata(buildSnapshot({ title }));
      expect(findByRuleId(findings, 'title-length').severity).toBe('pass');
    }
  });
});

describe('analyzeMetadata — description rules', () => {
  it('warns on a missing meta description and skips its length rule', () => {
    const findings = analyzeMetadata(
      buildSnapshot({ descriptions: [], meta: { description: null } }),
    );
    expect(findByRuleId(findings, 'meta-description-present').severity).toBe('warn');
    expect(findings.some((f) => f.ruleId === 'meta-description-length')).toBe(false);
  });

  it('errors on multiple conflicting description tags', () => {
    const findings = analyzeMetadata(
      buildSnapshot({ descriptions: ['First description here.', 'Second description here.'] }),
    );
    const finding = findByRuleId(findings, 'meta-description-multiple');
    expect(finding.severity).toBe('error');
    expect(finding.evidence).toContain('|');
  });

  it('errors on multiple identical description tags (still duplicates)', () => {
    const same = 'Identical description value.';
    const findings = analyzeMetadata(
      buildSnapshot({ descriptions: [same, same], meta: { description: same } }),
    );
    expect(findByRuleId(findings, 'meta-description-multiple').severity).toBe('error');
  });

  it('warns on a too-short description', () => {
    const findings = analyzeMetadata(
      buildSnapshot({ descriptions: ['Too short.'], meta: { description: 'Too short.' } }),
    );
    expect(findByRuleId(findings, 'meta-description-length').severity).toBe('warn');
  });

  it('warns on a too-long description', () => {
    const findings = analyzeMetadata(
      buildSnapshot({ descriptions: ['x'.repeat(161)], meta: { description: 'x'.repeat(161) } }),
    );
    expect(findByRuleId(findings, 'meta-description-length').severity).toBe('warn');
  });

  it('passes a description at both boundary lengths', () => {
    for (const length of [70, 160]) {
      const description = 'w'.repeat(length);
      const findings = analyzeMetadata(
        buildSnapshot({ descriptions: [description], meta: { description } }),
      );
      expect(findByRuleId(findings, 'meta-description-length').severity).toBe('pass');
    }
  });
});

describe('analyzeMetadata — canonical rules', () => {
  it('reports a missing canonical as info with remediation', () => {
    const findings = analyzeMetadata(buildSnapshot({ canonicals: [], meta: { canonical: null } }));
    const finding = findByRuleId(findings, 'canonical-present');
    expect(finding.severity).toBe('info');
    expect(finding.remediation).toBeTruthy();
  });

  it('errors on a relative canonical URL', () => {
    const findings = analyzeMetadata(
      buildSnapshot({ canonicals: ['/relative-only'], meta: { canonical: '/relative-only' } }),
    );
    const finding = findByRuleId(findings, 'canonical-valid');
    expect(finding.severity).toBe('error');
    expect(finding.evidence).toContain('relative');
  });

  it('errors on duplicate identical canonical tags', () => {
    const findings = analyzeMetadata(
      buildSnapshot({
        canonicals: ['https://example.com/page', 'https://example.com/page'],
        meta: { canonical: 'https://example.com/page' },
      }),
    );
    expect(findByRuleId(findings, 'canonical-valid').severity).toBe('error');
  });

  it('errors on conflicting canonical URLs', () => {
    const findings = analyzeMetadata(
      buildSnapshot({
        canonicals: ['https://example.com/a', 'https://example.com/b'],
        meta: { canonical: 'https://example.com/a' },
      }),
    );
    expect(findByRuleId(findings, 'canonical-valid').severity).toBe('error');
  });

  it('errors on a non-http(s) canonical scheme', () => {
    const findings = analyzeMetadata(
      buildSnapshot({
        canonicals: ['javascript:alert(1)'],
        meta: { canonical: 'javascript:alert(1)' },
      }),
    );
    expect(findByRuleId(findings, 'canonical-valid').severity).toBe('error');
  });

  it('passes a single absolute https canonical', () => {
    const findings = analyzeMetadata(buildSnapshot());
    expect(findByRuleId(findings, 'canonical-valid').severity).toBe('pass');
  });
});

describe('analyzeMetadata — technical rules', () => {
  it('warns when viewport, lang or HTTPS are missing', () => {
    const findings = analyzeMetadata(
      buildSnapshot({ url: 'http://example.com/', meta: { viewport: null, lang: null } }),
    );
    expect(findByRuleId(findings, 'viewport-present').severity).toBe('warn');
    expect(findByRuleId(findings, 'lang-present').severity).toBe('warn');
    expect(findByRuleId(findings, 'page-https').severity).toBe('warn');
  });

  it('errors on noindex robots directive', () => {
    const findings = analyzeMetadata(buildSnapshot({ meta: { robots: 'noindex, follow' } }));
    const finding = findByRuleId(findings, 'robots-directives');
    expect(finding.severity).toBe('error');
    expect(finding.remediation).toContain('noindex');
  });

  it('errors on robots none (noindex+nofollow)', () => {
    const findings = analyzeMetadata(buildSnapshot({ meta: { robots: 'none' } }));
    expect(findByRuleId(findings, 'robots-directives').severity).toBe('error');
  });

  it('warns on nofollow-only directive', () => {
    const findings = analyzeMetadata(buildSnapshot({ meta: { robots: 'index, nofollow' } }));
    expect(findByRuleId(findings, 'robots-directives').severity).toBe('warn');
  });

  it('passes index,follow and absent robots meta alike', () => {
    expect(findByRuleId(analyzeMetadata(buildSnapshot()), 'robots-directives').severity).toBe(
      'pass',
    );
    expect(
      findByRuleId(analyzeMetadata(buildSnapshot({ meta: { robots: null } })), 'robots-directives')
        .severity,
    ).toBe('pass');
  });
});

describe('analyzeMetadata — social rules', () => {
  it('informs (never warns) about missing Open Graph and twitter:card', () => {
    const findings = analyzeMetadata(
      buildSnapshot({
        meta: { ogTitle: null, ogDescription: null, ogImage: null, twitterCard: null },
      }),
    );
    for (const ruleId of [
      'og-title-present',
      'og-description-present',
      'og-image-present',
      'twitter-card-present',
    ]) {
      const finding = findByRuleId(findings, ruleId);
      expect(finding.severity).toBe('info');
      expect(finding.remediation).toBeTruthy();
    }
  });

  it('passes all social rules when tags are present', () => {
    const findings = analyzeMetadata(buildSnapshot());
    for (const ruleId of [
      'og-title-present',
      'og-description-present',
      'og-image-present',
      'twitter-card-present',
    ]) {
      expect(findByRuleId(findings, ruleId).severity).toBe('pass');
    }
  });
});

describe('analyzeHeadings', () => {
  it('passes a clean outline', () => {
    const findings = analyzeHeadings(buildSnapshot());
    expect(findings.every((f) => f.severity === 'pass')).toBe(true);
  });

  it('errors when no h1 exists', () => {
    const findings = analyzeHeadings(
      buildSnapshot({
        headings: [{ tag: 'h2', text: 'Only section' }],
        headingCounts: { h1: 0, h2: 1, h3: 0, h4: 0, h5: 0, h6: 0 },
      }),
    );
    expect(findByRuleId(findings, 'h1-present').severity).toBe('error');
  });

  it('errors when multiple h1 exist', () => {
    const findings = analyzeHeadings(
      buildSnapshot({
        headings: [
          { tag: 'h1', text: 'One' },
          { tag: 'h1', text: 'Two' },
        ],
        headingCounts: { h1: 2, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 },
      }),
    );
    expect(findByRuleId(findings, 'h1-unique').severity).toBe('error');
  });

  it('warns on skipped heading levels', () => {
    const findings = analyzeHeadings(
      buildSnapshot({
        headings: [
          { tag: 'h1', text: 'Main' },
          { tag: 'h3', text: 'Skipped h2' },
        ],
        headingCounts: { h1: 1, h2: 0, h3: 1, h4: 0, h5: 0, h6: 0 },
      }),
    );
    const order = findByRuleId(findings, 'heading-order');
    expect(order.severity).toBe('warn');
    expect(order.evidence).toContain('h1 → h3');
    expect(order.remediation).toBeTruthy();
  });

  it('warns when the page has no headings at all', () => {
    const findings = analyzeHeadings(
      buildSnapshot({
        headings: [],
        headingCounts: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 },
      }),
    );
    expect(findByRuleId(findings, 'heading-order').severity).toBe('warn');
  });
});

describe('analyzeImages', () => {
  it('passes when all images have descriptive alt text', () => {
    const findings = analyzeImages(buildSnapshot());
    expect(findByRuleId(findings, 'image-alt-present').severity).toBe('pass');
    expect(findByRuleId(findings, 'image-alt-empty').severity).toBe('pass');
    expect(findByRuleId(findings, 'image-alt-quality').severity).toBe('pass');
  });

  it('informs when a page has no images', () => {
    const findings = analyzeImages(buildSnapshot({ images: [], imageCount: 0 }));
    expect(findByRuleId(findings, 'image-alt-present').severity).toBe('info');
  });

  it('errors on a missing alt ATTRIBUTE (null) with evidence', () => {
    const findings = analyzeImages(
      buildSnapshot({
        images: [
          { src: 'https://example.com/a.png', alt: 'A diagram' },
          { src: 'https://example.com/b.png', alt: null },
        ],
      }),
    );
    const missing = findByRuleId(findings, 'image-alt-present');
    expect(missing.severity).toBe('error');
    expect(missing.title).toContain('missing the alt attribute');
    expect(missing.evidence).toContain('b.png');
    expect(missing.remediation).toBeTruthy();
  });

  it('errors when EVERY image lacks the alt attribute', () => {
    const findings = analyzeImages(
      buildSnapshot({
        images: [
          { src: 'https://example.com/a.png', alt: null },
          { src: 'https://example.com/b.png', alt: null },
        ],
      }),
    );
    expect(findByRuleId(findings, 'image-alt-present').severity).toBe('error');
  });

  it('treats empty-string alt as DECORATIVE (info), never as missing', () => {
    const findings = analyzeImages(
      buildSnapshot({
        images: [
          { src: 'https://example.com/divider.png', alt: '' },
          { src: 'https://example.com/photo.png', alt: 'A sunny beach' },
        ],
      }),
    );
    const empty = findByRuleId(findings, 'image-alt-empty');
    expect(empty.severity).toBe('info');
    expect(empty.detail).toContain('decorative');
    expect(findByRuleId(findings, 'image-alt-present').severity).toBe('pass');
  });

  it('warns on filename-like alt text as possibly uninformative', () => {
    const findings = analyzeImages(
      buildSnapshot({
        images: [{ src: 'https://example.com/a.png', alt: 'photo1.png' }],
        imageCount: 1,
      }),
    );
    const quality = findByRuleId(findings, 'image-alt-quality');
    expect(quality.severity).toBe('warn');
    expect(quality.detail).toContain('does not understand');
  });

  it('warns on generic alt text (image, logo, icon, photo)', () => {
    for (const alt of ['image', 'LOGO', 'icon 2', 'photo']) {
      const findings = analyzeImages(
        buildSnapshot({ images: [{ src: 'https://example.com/a.png', alt }], imageCount: 1 }),
      );
      expect(findByRuleId(findings, 'image-alt-quality').severity).toBe('warn');
    }
  });

  it('passes meaningful alt text', () => {
    const findings = analyzeImages(
      buildSnapshot({
        images: [{ src: 'https://example.com/a.png', alt: 'Golden retriever catching a frisbee' }],
        imageCount: 1,
      }),
    );
    expect(findByRuleId(findings, 'image-alt-quality').severity).toBe('pass');
  });
});

describe('analyzeLinks', () => {
  it('classifies internal and external links', () => {
    const findings = analyzeLinks(buildSnapshot());
    const profile = findByRuleId(findings, 'link-profile');
    expect(profile.detail).toContain('1 internal');
    expect(profile.detail).toContain('1 external');
  });

  it('errors on links with no accessible name at all', () => {
    const findings = analyzeLinks(
      buildSnapshot({
        links: [{ href: '/x', text: '', rel: null, target: null, accessibleName: '' }],
        linkCount: 1,
      }),
    );
    const anchor = findByRuleId(findings, 'link-anchor-text');
    expect(anchor.severity).toBe('error');
    expect(anchor.evidence).toContain('/x');
  });

  it('passes when all links have visible text', () => {
    const findings = analyzeLinks(buildSnapshot());
    expect(findByRuleId(findings, 'link-anchor-text').severity).toBe('pass');
  });

  it('informs (not errors) on icon links named via aria-label', () => {
    const findings = analyzeLinks(
      buildSnapshot({
        links: [
          { href: '/search', text: '', rel: null, target: null, accessibleName: 'Open search' },
        ],
        linkCount: 1,
      }),
    );
    expect(findByRuleId(findings, 'link-anchor-text').severity).toBe('pass');
    const nonVisual = findByRuleId(findings, 'link-named-nonvisually');
    expect(nonVisual.severity).toBe('info');
    expect(nonVisual.detail).toContain('does not affect the score');
  });

  it('informs on image links named via inner img alt', () => {
    const findings = analyzeLinks(
      buildSnapshot({
        links: [
          { href: '/home', text: '', rel: null, target: null, accessibleName: 'Vittix home' },
        ],
        linkCount: 1,
      }),
    );
    expect(findByRuleId(findings, 'link-named-nonvisually').severity).toBe('info');
  });

  it('counts nofollow links in the profile', () => {
    const findings = analyzeLinks(
      buildSnapshot({
        links: [
          {
            href: 'https://ads.example/',
            text: 'Ad',
            rel: 'nofollow sponsored',
            target: null,
            accessibleName: 'Ad',
          },
        ],
        linkCount: 1,
      }),
    );
    expect(findByRuleId(findings, 'link-profile').detail).toContain('1 nofollow');
  });
});

describe('analyzeStructuredData', () => {
  it('informs when no JSON-LD is present', () => {
    const findings = analyzeStructuredData(
      buildSnapshot({ structuredData: [], structuredDataCount: 0 }),
    );
    expect(findByRuleId(findings, 'structured-data-present').severity).toBe('info');
    expect(findByRuleId(findings, 'structured-data-valid').severity).toBe('pass');
  });

  it('passes valid JSON-LD and reports the @type', () => {
    const findings = analyzeStructuredData(buildSnapshot());
    const present = findByRuleId(findings, 'structured-data-present');
    expect(present.severity).toBe('pass');
    expect(present.detail).toContain('WebPage');
    expect(findByRuleId(findings, 'structured-data-valid').severity).toBe('pass');
  });

  it('errors on syntactically invalid JSON-LD', () => {
    const findings = analyzeStructuredData(
      buildSnapshot({
        structuredData: [{ raw: '{ "@type": "Product", "name": "Broken", }' }], // trailing comma
      }),
    );
    const invalid = findByRuleId(findings, 'structured-data-valid');
    expect(invalid.severity).toBe('error');
    expect(invalid.remediation).toBeTruthy();
  });

  it('does NOT claim schema validity for parsed blocks', () => {
    const findings = analyzeStructuredData(
      buildSnapshot({ structuredData: [{ raw: '{ "nonsense": true }' }] }),
    );
    const valid = findByRuleId(findings, 'structured-data-valid');
    expect(valid.severity).toBe('pass');
    expect(valid.detail.toLowerCase()).toContain('validity is not checked');
  });

  it('handles @graph containers', () => {
    const findings = analyzeStructuredData(
      buildSnapshot({
        structuredData: [
          { raw: '{ "@graph": [ { "@type": "Organization" }, { "@type": "WebSite" } ] }' },
        ],
      }),
    );
    expect(findByRuleId(findings, 'structured-data-present').detail).toContain('@graph');
  });
});

describe('analyzeMetadata — lang format (v3)', () => {
  it('warns on malformed language tags', () => {
    for (const bad of ['english', 'en_US', '123']) {
      const findings = analyzeMetadata(buildSnapshot({ meta: { lang: bad } }));
      expect(findByRuleId(findings, 'lang-format').severity).toBe('warn');
      expect(findByRuleId(findings, 'lang-format').evidence).toBe(bad);
    }
  });

  it('passes valid BCP-47 shaped tags', () => {
    for (const good of ['en', 'en-US', 'zh-Hans', 'de-DE-1996']) {
      const findings = analyzeMetadata(buildSnapshot({ meta: { lang: good } }));
      expect(findByRuleId(findings, 'lang-format').severity).toBe('pass');
    }
  });

  it('is neutral when no lang is declared', () => {
    const findings = analyzeMetadata(buildSnapshot({ meta: { lang: null } }));
    expect(findByRuleId(findings, 'lang-format').severity).toBe('pass');
  });
});

describe('analyzeMetadata — viewport responsiveness (v3)', () => {
  it('warns on fixed-width viewports', () => {
    const findings = analyzeMetadata(buildSnapshot({ meta: { viewport: 'width=1024' } }));
    expect(findByRuleId(findings, 'viewport-responsive').severity).toBe('warn');
    expect(findByRuleId(findings, 'viewport-responsive').detail).toContain('device-width');
  });

  it('warns when pinch zoom is disabled', () => {
    for (const viewport of [
      'width=device-width, initial-scale=1, user-scalable=no',
      'width=device-width, initial-scale=1, maximum-scale=1',
    ]) {
      const findings = analyzeMetadata(buildSnapshot({ meta: { viewport } }));
      expect(findByRuleId(findings, 'viewport-responsive').severity).toBe('warn');
      expect(findByRuleId(findings, 'viewport-responsive').title).toContain('zoom');
    }
  });

  it('passes a responsive viewport', () => {
    const findings = analyzeMetadata(buildSnapshot());
    expect(findByRuleId(findings, 'viewport-responsive').severity).toBe('pass');
  });
});

describe('analyzeMetadata — robots reconciliation (v3)', () => {
  it('warns on conflicting robots meta tags', () => {
    const findings = analyzeMetadata(
      buildSnapshot({ robotsValues: ['index, follow', 'noindex, nofollow'] }),
    );
    const conflict = findings.find(
      (f) => f.ruleId === 'robots-directives' && f.title.includes('Conflicting'),
    );
    expect(conflict?.severity).toBe('warn');
    expect(conflict?.remediation).toBeTruthy();
  });

  it('does not warn when duplicate robots tags agree', () => {
    const findings = analyzeMetadata(
      buildSnapshot({ robotsValues: ['index, follow', 'index, follow'] }),
    );
    expect(
      findings.some((f) => f.ruleId === 'robots-directives' && f.title.includes('Conflicting')),
    ).toBe(false);
  });

  it('still errors on noindex regardless of duplicates', () => {
    const findings = analyzeMetadata(buildSnapshot({ robotsValues: ['noindex', 'index, follow'] }));
    const noindex = findings.find(
      (f) => f.ruleId === 'robots-directives' && f.severity === 'error',
    );
    expect(noindex).toBeDefined();
  });
});

describe('analyzeHreflang (v3)', () => {
  it('passes when no hreflang entries exist', () => {
    const findings = analyzeHreflang(buildSnapshot());
    expect(findByRuleId(findings, 'hreflang-syntax').severity).toBe('pass');
    expect(findByRuleId(findings, 'hreflang-duplicates').severity).toBe('pass');
    expect(findByRuleId(findings, 'hreflang-consistency').severity).toBe('pass');
  });

  it('passes a well-formed self-referencing cluster', () => {
    const findings = analyzeHreflang(
      buildSnapshot({
        hreflang: [
          { lang: 'en', href: 'https://example.com/page' },
          { lang: 'de', href: 'https://example.com/de' },
          { lang: 'x-default', href: 'https://example.com/page' },
        ],
        hreflangCount: 3,
      }),
    );
    expect(findByRuleId(findings, 'hreflang-syntax').severity).toBe('pass');
    expect(findByRuleId(findings, 'hreflang-duplicates').severity).toBe('pass');
    expect(findByRuleId(findings, 'hreflang-consistency').severity).toBe('pass');
  });

  it('errors on entries with a missing href', () => {
    const findings = analyzeHreflang(
      buildSnapshot({
        hreflang: [
          { lang: 'en', href: 'https://example.com/page' },
          { lang: 'de', href: '' },
        ],
        hreflangCount: 2,
      }),
    );
    const syntax = findByRuleId(findings, 'hreflang-syntax');
    expect(syntax.severity).toBe('error');
    expect(syntax.evidence).toContain('missing href');
  });

  it('warns on malformed language codes (underscore)', () => {
    const findings = analyzeHreflang(
      buildSnapshot({
        hreflang: [{ lang: 'en_US', href: 'https://example.com/us' }],
        hreflangCount: 1,
      }),
    );
    expect(findByRuleId(findings, 'hreflang-syntax').severity).toBe('warn');
    expect(findByRuleId(findings, 'hreflang-syntax').evidence).toContain('en_US');
  });

  it('warns on duplicate language codes', () => {
    const findings = analyzeHreflang(
      buildSnapshot({
        hreflang: [
          { lang: 'en', href: 'https://example.com/a' },
          { lang: 'en', href: 'https://example.com/b' },
        ],
        hreflangCount: 2,
      }),
    );
    const duplicates = findByRuleId(findings, 'hreflang-duplicates');
    expect(duplicates.severity).toBe('warn');
    expect(duplicates.evidence).toContain('en');
  });

  it('informs when the cluster lacks a self-reference', () => {
    const findings = analyzeHreflang(
      buildSnapshot({
        hreflang: [{ lang: 'de', href: 'https://example.com/de' }],
        hreflangCount: 1,
      }),
    );
    expect(findByRuleId(findings, 'hreflang-consistency').severity).toBe('info');
  });

  it('warns when the canonical contradicts a self-referencing cluster', () => {
    const findings = analyzeHreflang(
      buildSnapshot({
        canonicals: ['https://example.com/canonical-elsewhere'],
        meta: { canonical: 'https://example.com/canonical-elsewhere' },
        hreflang: [{ lang: 'en', href: 'https://example.com/page' }],
        hreflangCount: 1,
      }),
    );
    const consistency = findByRuleId(findings, 'hreflang-consistency');
    expect(consistency.severity).toBe('warn');
    expect(consistency.remediation).toContain('agree');
  });
});

describe('analyzeLinks — internal link quality (v3)', () => {
  it('warns on generic internal anchor text with evidence', () => {
    const findings = analyzeLinks(
      buildSnapshot({
        links: [
          {
            href: '/pricing',
            text: 'click here',
            rel: null,
            target: null,
            accessibleName: 'click here',
          },
          {
            href: '/docs',
            text: 'Read more',
            rel: null,
            target: null,
            accessibleName: 'Read more',
          },
          {
            href: 'https://other.com/',
            text: 'click here',
            rel: null,
            target: null,
            accessibleName: 'click here',
          },
        ],
        linkCount: 3,
      }),
    );
    const quality = findByRuleId(findings, 'internal-link-quality');
    expect(quality.severity).toBe('warn');
    expect(quality.evidence).toContain('/pricing');
    // External generic anchors are not counted.
    expect(quality.evidence).not.toContain('other.com');
  });

  it('passes descriptive internal anchors', () => {
    const findings = analyzeLinks(buildSnapshot());
    expect(findByRuleId(findings, 'internal-link-quality').severity).toBe('pass');
  });
});

describe('analyzeStructuredData — @context/@type structure (v3)', () => {
  it('warns on parsed blocks missing @context or @type', () => {
    const findings = analyzeStructuredData(
      buildSnapshot({ structuredData: [{ raw: '{ "name": "No structure here" }' }] }),
    );
    const context = findByRuleId(findings, 'structured-data-context');
    expect(context.severity).toBe('warn');
    expect(context.detail).toContain('not validated');
  });

  it('passes blocks with @context and @type', () => {
    const findings = analyzeStructuredData(buildSnapshot());
    expect(findByRuleId(findings, 'structured-data-context').severity).toBe('pass');
  });

  it('is neutral when nothing parses', () => {
    const findings = analyzeStructuredData(
      buildSnapshot({ structuredData: [{ raw: '{ broken' }] }),
    );
    expect(findByRuleId(findings, 'structured-data-context').severity).toBe('pass');
  });

  it('accepts @graph containers as structural', () => {
    const findings = analyzeStructuredData(
      buildSnapshot({
        structuredData: [
          {
            raw: '{ "@context": "https://schema.org", "@graph": [ { "@type": "Organization" } ] }',
          },
        ],
      }),
    );
    expect(findByRuleId(findings, 'structured-data-context').severity).toBe('pass');
  });
});
