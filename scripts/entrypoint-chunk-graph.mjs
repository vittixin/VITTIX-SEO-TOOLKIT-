import { readFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../apps/extension/.output/chrome-mv3',
);

function chunkReferences(source) {
  return [...source.matchAll(/(?:from\s*|import\s*(?:\(\s*)?)['"]([^'"]+\.js)['"]/g)].map(
    ([, specifier]) => specifier,
  );
}

function graphFor(htmlFile) {
  const html = readFileSync(resolve(root, htmlFile), 'utf8');
  const entries = [...html.matchAll(/(?:src|href)="\/(chunks\/[^"?#]+\.js)"/g)].map(
    ([, path]) => path,
  );
  const graph = new Map();
  const visit = (path) => {
    if (graph.has(path)) return;
    const source = readFileSync(resolve(root, path), 'utf8');
    const imports = [...new Set(chunkReferences(source))].map((specifier) =>
      posix.normalize(posix.join(posix.dirname(path), specifier)),
    );
    graph.set(path, imports);
    for (const child of imports) visit(child);
  };
  for (const entry of entries) visit(entry);
  return { entries, graph };
}

for (const htmlFile of ['popup.html', 'panel.html']) {
  const { entries, graph } = graphFor(htmlFile);
  console.log(`${htmlFile} production chunk graph`);
  for (const [chunk, imports] of graph) {
    console.log(`  ${chunk}`);
    for (const dependency of imports) console.log(`    └─ ${dependency}`);
  }
  console.log(`  HTML entries/preloads: ${entries.length}`);
}
