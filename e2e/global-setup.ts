import { createServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
export default async function globalSetup() {
  const root = resolve(import.meta.dirname, '../test-results/local-server');
  mkdirSync(root, { recursive: true });
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      resolve(import.meta.dirname, 'generate-test-cert.ps1'),
    ],
    { stdio: 'ignore' },
  );
  const pfx = readFileSync(resolve(root, 'cert.pfx'));
  const server = createServer({ pfx, passphrase: 'local-test-only' }, (req, res) => {
    const path = new URL(req.url ?? '/', 'https://fixture.test').pathname;
    const host = req.headers.host ?? 'fixture.test';
    if (path === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(`User-agent: VittixBot\nCrawl-delay: 0.1\nSitemap: https://${host}/sitemap.xml.gz\n`);
      return;
    }
    if (path === '/sitemap.xml.gz') {
      res.writeHead(200, { 'content-type': 'application/gzip' });
      res.end(
        gzipSync(
          Buffer.from(
            `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://${host}/about/</loc></url></urlset>`,
          ),
        ),
      );
      return;
    }
    if (path === '/about') {
      res.writeHead(301, { location: '/about/' });
      res.end();
      return;
    }
    if (path === '/about/') {
      const pageBody =
        '<!doctype html><html lang="en"><head><title>About final URL</title><meta name="description" content="A local HTTPS test page for auditing redirects and headers." /></head><body><h1>About</h1><p>This real server page was fetched by the extension.</p></body></html>';
      res.writeHead(200, {
        'content-type': 'text/html',
        'content-length': String(Buffer.byteLength(pageBody)),
        'content-encoding': 'identity',
        'x-robots-tag': 'noindex',
        'cache-control': 'no-cache',
        'strict-transport-security': 'max-age=31536000',
        'content-security-policy': "default-src 'self'",
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
        'x-frame-options': 'DENY',
      });
      res.end(pageBody);
      return;
    }
    if (path === '/slow') {
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<title>Slow</title>');
      }, 2200);
      return;
    }
    if (path === '/loop-a') {
      res.writeHead(302, { location: '/loop-b' });
      res.end();
      return;
    }
    if (path === '/loop-b') {
      res.writeHead(302, { location: '/loop-a' });
      res.end();
      return;
    }
    if (path === '/off-origin') {
      res.writeHead(302, { location: 'https://other.test/target' });
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(
      '<!doctype html><html lang="en"><head><title>Local audit home</title><meta name="description" content="A local fixture website served by a real HTTPS server for browser end to end testing." /></head><body><h1>Local audit home</h1><a href="https://fixture.test:' +
        server.address()?.port +
        '/about">About</a><a href="https://fixture.test:' +
        server.address()?.port +
        '/slow">Slow</a><a href="https://fixture.test:' +
        server.address()?.port +
        '/loop-a">Loop</a></body></html>',
    );
  });
  await new Promise<void>((ok, fail) =>
    server.listen(0, '127.0.0.1', () => ok()).once('error', fail),
  );
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('local TLS server failed to bind');
  writeFileSync(resolve(root, 'state.json'), JSON.stringify({ port: address.port }));
  return async () =>
    new Promise<void>((ok, fail) => server.close((error) => (error ? fail(error) : ok())));
}
