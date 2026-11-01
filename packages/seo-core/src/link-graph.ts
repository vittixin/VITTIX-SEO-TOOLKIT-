export interface LinkGraphPage {
  url: string;
  finalUrl?: string | null;
  depth: number;
  links?: readonly { url: string; text?: string | null; rel?: string | null }[];
}
export interface LinkGraphNode {
  url: string;
  depth: number | null;
  inbound: number;
  outbound: number;
  nofollowOnlyReachable: boolean;
  singleSourceInbound: boolean;
  anchorDiversity: number;
  orphanCandidate: boolean | null;
}
export interface LinkGraphEdge {
  from: string;
  to: string;
  anchorText: string;
  nofollow: boolean;
}
export interface LinkGraph {
  nodes: LinkGraphNode[];
  edges: LinkGraphEdge[];
  orphanStatus: 'checked' | 'unchecked';
  depthHistogram: Record<string, number>;
}
/** Build a bounded crawl graph. Orphan status is checked only with complete source evidence. */
export function buildInternalLinkGraph(
  pages: readonly LinkGraphPage[],
  startUrl: string,
  evidenceComplete: boolean,
): LinkGraph {
  const bounded = pages.slice(0, 50),
    aliases = new Map<string, string>();
  for (const p of bounded) {
    aliases.set(p.url, p.finalUrl ?? p.url);
    if (p.finalUrl) aliases.set(p.finalUrl, p.finalUrl);
  }
  const urls = [...new Set(bounded.map((p) => p.finalUrl ?? p.url))].sort();
  const edges: LinkGraphEdge[] = [];
  for (const p of bounded) {
    const from = p.finalUrl ?? p.url;
    for (const l of p.links ?? []) {
      const target = aliases.get(l.url) ?? l.url;
      if (!urls.includes(target)) continue;
      edges.push({
        from,
        to: target,
        anchorText: (l.text ?? '').slice(0, 2048),
        nofollow: /\bnofollow\b/i.test(l.rel ?? ''),
      });
    }
  }
  const unique = [
    ...new Map(
      edges.map((e) => [`${e.from}\0${e.to}\0${e.anchorText}\0${e.nofollow}`, e]),
    ).values(),
  ];
  const root = aliases.get(startUrl) ?? startUrl,
    distance = new Map<string, number>([[root, 0]]),
    queue = [root];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of unique)
      if (e.from === cur && !e.nofollow && !distance.has(e.to)) {
        distance.set(e.to, (distance.get(cur) ?? 0) + 1);
        queue.push(e.to);
      }
  }
  const nodes = urls.map((url) => {
    const incoming = unique.filter((e) => e.to === url),
      outgoing = unique.filter((e) => e.from === url);
    const distinct = new Set(
      incoming.map((e) => e.anchorText.trim().toLocaleLowerCase()).filter(Boolean),
    );
    const allNoFollow = incoming.length > 0 && incoming.every((e) => e.nofollow);
    const reached = distance.has(url);
    return {
      url,
      depth: distance.get(url) ?? null,
      inbound: incoming.length,
      outbound: outgoing.length,
      nofollowOnlyReachable: allNoFollow && !reached,
      singleSourceInbound: incoming.length > 0 && new Set(incoming.map((e) => e.from)).size === 1,
      anchorDiversity: incoming.length ? distinct.size / incoming.length : 0,
      orphanCandidate: evidenceComplete ? incoming.length === 0 && url !== root : null,
    };
  });
  const depthHistogram: Record<string, number> = {};
  for (const n of nodes)
    if (n.depth !== null)
      depthHistogram[String(n.depth)] = (depthHistogram[String(n.depth)] ?? 0) + 1;
  return {
    nodes,
    edges: unique,
    orphanStatus: evidenceComplete ? 'checked' : 'unchecked',
    depthHistogram,
  };
}
