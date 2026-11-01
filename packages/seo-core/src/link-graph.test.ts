import { describe, expect, it } from 'vitest';
import { buildInternalLinkGraph } from './link-graph.js';
import { analyzeInternalRedirectLinks } from './analyzers/site-graph.js';
describe('internal link graph', () => {
  it('returns an empty deterministic graph for empty input', () => {
    expect(buildInternalLinkGraph([], 'https://empty.test/', false)).toEqual({
      nodes: [],
      edges: [],
      orphanStatus: 'unchecked',
      depthHistogram: {},
    });
  });
  it('handles cycles, self-links and duplicate edges deterministically', () => {
    const pages = [
      {
        url: 'a',
        depth: 0,
        links: [
          { url: 'b', text: 'B' },
          { url: 'b', text: 'B' },
          { url: 'a', text: 'self' },
        ],
      },
      { url: 'b', depth: 1, links: [{ url: 'a', text: 'A' }] },
    ];
    const graph = buildInternalLinkGraph(pages, 'a', true);
    expect(graph.edges).toHaveLength(3);
    expect(graph.nodes.find((n) => n.url === 'b')?.depth).toBe(1);
    expect(graph.nodes.find((n) => n.url === 'b')?.orphanCandidate).toBe(false);
  });
  it('marks orphan evidence unchecked when coverage is incomplete and caps anchors', () => {
    const graph = buildInternalLinkGraph(
      [
        { url: 'a', depth: 0, links: [{ url: 'b', text: 'x'.repeat(9999) }] },
        { url: 'b', depth: 1 },
      ],
      'a',
      false,
    );
    expect(graph.orphanStatus).toBe('unchecked');
    expect(graph.nodes.find((n) => n.url === 'b')?.orphanCandidate).toBeNull();
    expect(graph.edges[0]!.anchorText).toHaveLength(2048);
  });
  it('treats final URL as the node for redirect aliases', () => {
    const graph = buildInternalLinkGraph(
      [
        { url: 'a', finalUrl: 'a', depth: 0, links: [{ url: 'b', text: 'go' }] },
        { url: 'b', finalUrl: 'b/', depth: 1 },
      ],
      'a',
      true,
    );
    expect(graph.edges[0]!.to).toBe('b/');
  });
  it('reports redirecting targets in internal links as informational hygiene', () => {
    expect(
      analyzeInternalRedirectLinks([{ url: 'a', links: [{ url: 'b' }] }], new Set(['b']))[0],
    ).toMatchObject({ ruleId: 'redirect-in-internal-links', severity: 'info' });
  });
});
