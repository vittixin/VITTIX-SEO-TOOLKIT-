import type { Finding, PageSnapshot } from '@vittix/shared';
import { finding } from './util.js';

/**
 * Structured data (JSON-LD) rules.
 *
 * Deliberate scope: SYNTAX validation only (JSON.parse). A syntactically
 * valid block is NOT claimed to be schema-valid — that would require the
 * schema.org vocabulary, which is not checked locally.
 */
export function analyzeStructuredData(snapshot: PageSnapshot): Finding[] {
  const findings: Finding[] = [];
  const blocks = snapshot.structuredData;

  if (blocks.length === 0) {
    findings.push(
      finding(
        'structured-data-present',
        'technical',
        'info',
        'No JSON-LD structured data found',
        'No <script type="application/ld+json"> blocks were found. Structured data helps machines understand entities on the page (products, articles, FAQs). Missing it is common and not an error by itself.',
        {
          remediation:
            'If the page represents a distinct entity (article, product, organization, …), add a JSON-LD block describing it.',
        },
      ),
    );
    findings.push(
      finding(
        'structured-data-valid',
        'technical',
        'pass',
        'Nothing to validate',
        'No JSON-LD blocks were present, so there is no syntax to check.',
      ),
    );
    findings.push(
      finding(
        'structured-data-context',
        'technical',
        'pass',
        'Nothing to check for @context/@type',
        'No JSON-LD blocks were present, so there is no structure to inspect.',
      ),
    );
    return findings;
  }

  const truncated = snapshot.structuredDataCount > blocks.length;
  const types: string[] = [];
  const parseErrors: string[] = [];

  blocks.forEach((block, index) => {
    try {
      const parsed: unknown = JSON.parse(block.raw);
      const type = extractType(parsed);
      types.push(type ?? '(no @type)');
    } catch (error) {
      parseErrors.push(
        `block ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  findings.push(
    finding(
      'structured-data-present',
      'technical',
      'pass',
      `JSON-LD structured data present (${blocks.length} block${blocks.length === 1 ? '' : 's'})`,
      `Detected @type values: ${types.slice(0, 5).join(', ')}${truncated ? ` — plus ${snapshot.structuredDataCount - blocks.length} more block(s) not retained` : ''}.`,
    ),
  );

  if (parseErrors.length > 0) {
    findings.push(
      finding(
        'structured-data-valid',
        'technical',
        'error',
        `${parseErrors.length} JSON-LD block${parseErrors.length === 1 ? ' is' : 's are'} not valid JSON`,
        'These blocks cannot be parsed as JSON, so search engines ignore them entirely. This is a syntax check only — blocks that parse are not claimed to be schema-valid.',
        {
          evidence:
            parseErrors.slice(0, 2).join('; ') +
            (parseErrors.length > 2 ? ` … (${parseErrors.length} errors)` : ''),
          remediation:
            'Fix the JSON syntax (trailing commas, unescaped quotes, HTML entities like &quot;) or generate the block from a serializer instead of string templates.',
        },
      ),
    );
  } else {
    findings.push(
      finding(
        'structured-data-valid',
        'technical',
        'pass',
        'All JSON-LD blocks parse as valid JSON',
        `${blocks.length} block${blocks.length === 1 ? '' : 's'} parsed successfully. Syntax only — schema.org validity is not checked.`,
      ),
    );
  }

  // --- basic @context / @type structural check --------------------------------
  // Among the blocks that PARSE: a JSON-LD block should declare @context
  // (typically https://schema.org) and @type. Blocks missing them are likely
  // mis-templated. This is a structural check — NOT schema.org or
  // rich-result validation.
  const parseable = blocks
    .map((block) => {
      try {
        return JSON.parse(block.raw) as unknown;
      } catch {
        return null;
      }
    })
    .filter((parsed): parsed is Exclude<unknown, null> => parsed !== null);

  const missingStructure: string[] = [];
  for (const parsed of parseable) {
    if (parsed === null || typeof parsed !== 'object') continue;
    const record = parsed as Record<string, unknown>;
    const hasContext = typeof record['@context'] === 'string' || Array.isArray(record['@graph']);
    const hasType = record['@type'] !== undefined || Array.isArray(record['@graph']);
    if (!hasContext || !hasType) {
      const missing: string[] = [];
      if (!hasContext) missing.push('@context');
      if (!hasType) missing.push('@type');
      missingStructure.push(missing.join(' + '));
    }
  }

  if (parseable.length === 0) {
    findings.push(
      finding(
        'structured-data-context',
        'technical',
        'pass',
        'Nothing to check for @context/@type',
        'No JSON-LD block parsed successfully, so there is no structure to inspect.',
      ),
    );
  } else if (missingStructure.length > 0) {
    findings.push(
      finding(
        'structured-data-context',
        'technical',
        'warn',
        `${missingStructure.length} JSON-LD block${missingStructure.length === 1 ? ' is' : 's are'} missing @context or @type`,
        'Parsed JSON-LD blocks should declare "@context" (usually https://schema.org) and "@type". Blocks without them are ignored as structured data. This is a structural check only — schema.org and rich-result validity are not validated.',
        {
          evidence: `blocks missing: ${missingStructure.slice(0, 3).join(', ')}`,
          remediation:
            'Add "@context": "https://schema.org" and a "@type" to each JSON-LD block, or move non-JSON-LD data out of ld+json scripts.',
        },
      ),
    );
  } else {
    findings.push(
      finding(
        'structured-data-context',
        'technical',
        'pass',
        'JSON-LD blocks declare @context and @type',
        `${parseable.length} parsed block${parseable.length === 1 ? '' : 's'} checked for basic structure only.`,
      ),
    );
  }

  return findings;
}

function extractType(parsed: unknown): string | null {
  if (parsed === null || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;
  const type = record['@type'];
  if (typeof type === 'string') return type;
  if (Array.isArray(type)) {
    return type.filter((entry): entry is string => typeof entry === 'string').join('+') || null;
  }
  // @graph containers
  const graph = record['@graph'];
  if (Array.isArray(graph)) {
    const graphTypes = graph
      .map((entry) => (entry && typeof entry === 'object' ? extractType(entry) : null))
      .filter((entry): entry is string => entry !== null);
    if (graphTypes.length > 0) return `@graph(${graphTypes.slice(0, 3).join(', ')})`;
  }
  return null;
}
