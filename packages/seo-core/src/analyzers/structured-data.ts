import type { Finding, PageSnapshot } from '@vittix/shared';
import { STRUCTURED_DATA_REGISTRY } from '../rules.js';
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

  findings.push(...typedValidation(parseable, truncated, snapshot.structuredDataCount));

  return findings;
}

interface FlatNode {
  type: string;
  props: Record<string, unknown>;
}

/** Flatten parsed JSON-LD into nodes: handles arrays and @graph containers. */
function flattenNodes(parsed: unknown, out: FlatNode[], depth = 0): void {
  if (depth > 5 || out.length >= 20) return;
  if (Array.isArray(parsed)) {
    for (const entry of parsed) flattenNodes(entry, out, depth + 1);
    return;
  }
  if (parsed === null || typeof parsed !== 'object') return;
  const record = parsed as Record<string, unknown>;
  const graph = record['@graph'];
  if (Array.isArray(graph)) {
    for (const entry of graph) flattenNodes(entry, out, depth + 1);
    return;
  }
  const type = record['@type'];
  if (typeof type !== 'string' || type === '') return;
  out.push({ type, props: record });
}

/**
 * Typed structural validation against the in-repo registry. One finding per
 * type (never stacks). Based on Google's documented requirements as of
 * 2026-11; passing does NOT guarantee rich results.
 */
function typedValidation(
  parseable: readonly unknown[],
  truncated: boolean,
  totalCount: number,
): Finding[] {
  const nodes: FlatNode[] = [];
  for (const parsed of parseable) flattenNodes(parsed, nodes, 0);

  const known = nodes.filter((node) => node.type in STRUCTURED_DATA_REGISTRY);
  if (known.length === 0) {
    return [
      finding(
        'structured-data-type-detected',
        'technical',
        'info',
        'No recognized structured-data types',
        `Parsed JSON-LD contained no types from the supported registry (${Object.keys(STRUCTURED_DATA_REGISTRY).join(', ')}). Detected raw types: ${[...new Set(nodes.map((node) => node.type))].slice(0, 5).join(', ') || 'none'}.`,
      ),
      finding(
        'structured-data-required-props',
        'technical',
        'pass',
        'Nothing to validate for required properties',
        'No recognized types were present.',
      ),
      finding(
        'structured-data-recommended-props',
        'technical',
        'pass',
        'Nothing to validate for recommended properties',
        'No recognized types were present.',
      ),
    ];
  }

  const findings: Finding[] = [
    finding(
      'structured-data-type-detected',
      'technical',
      'pass',
      `Structured-data types detected: ${known
        .map((node) => node.type)
        .slice(0, 5)
        .join(', ')}`,
      `${known.length} recognized node${known.length === 1 ? '' : 's'} found${truncated ? ` (of ${totalCount} blocks, truncated)` : ''}. Based on Google's documented requirements as of 2026-11 — passing validation does NOT guarantee rich results.`,
    ),
  ];

  const byType = new Map<string, FlatNode[]>();
  for (const node of known) {
    const list = byType.get(node.type) ?? [];
    list.push(node);
    byType.set(node.type, list);
  }

  for (const [type, typeNodes] of byType) {
    const spec = STRUCTURED_DATA_REGISTRY[type];
    if (spec === undefined) continue;
    const missingRequired = new Set<string>();
    const missingRecommended = new Set<string>();
    for (const node of typeNodes) {
      for (const prop of spec.required) {
        const value = node.props[prop];
        if (value === undefined || value === null || value === '') {
          missingRequired.add(prop);
        }
      }
      for (const prop of spec.recommended) {
        const value = node.props[prop];
        if (value === undefined || value === null || value === '') {
          missingRecommended.add(prop);
        }
      }
    }
    if (missingRequired.size > 0) {
      findings.push(
        finding(
          'structured-data-required-props',
          'technical',
          // warn rather than error: structural validation cannot confirm the
          // property is genuinely absent (it may be a nested/unknown shape).
          'warn',
          `${type}: missing required propert${missingRequired.size === 1 ? 'y' : 'ies'}`,
          `${typeNodes.length} ${type} node${typeNodes.length === 1 ? '' : 's'} lack required properties: ${[...missingRequired].join(', ')}. Incomplete required properties commonly disqualify the item from rich results. Based on Google's documentation as of 2026-11; passing validation does NOT guarantee rich results.`,
          {
            evidence: `missing: ${[...missingRequired].slice(0, 5).join(', ')}`,
            remediation: `Add the missing ${type} properties (${[...missingRequired].join(', ')}) to each ${type} node.`,
          },
        ),
      );
    } else {
      findings.push(
        finding(
          'structured-data-required-props',
          'technical',
          'pass',
          `${type}: all required properties present`,
          `${typeNodes.length} ${type} node${typeNodes.length === 1 ? '' : 's'} checked. Structural check only — does not guarantee rich results.`,
        ),
      );
    }
    if (missingRecommended.size > 0) {
      findings.push(
        finding(
          'structured-data-recommended-props',
          'technical',
          'info',
          `${type}: recommended properties missing`,
          `Recommended for ${type}: ${[...missingRecommended].join(', ')}. Recommended properties enrich the result but are not disqualifying.`,
          {
            remediation: `Consider adding: ${[...missingRecommended].join(', ')}.`,
          },
        ),
      );
    } else {
      findings.push(
        finding(
          'structured-data-recommended-props',
          'technical',
          'pass',
          `${type}: recommended properties present`,
          `${typeNodes.length} ${type} node${typeNodes.length === 1 ? '' : 's'} checked.`,
        ),
      );
    }
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
