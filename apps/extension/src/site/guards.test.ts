import { describe, expect, it } from 'vitest';
import { checkCrawlableOrigin, isSameOriginUrl, permissionPatternForOrigin } from './guards';

describe('checkCrawlableOrigin — the SSRF / private-network boundary', () => {
  it('allows ordinary public https origins', () => {
    for (const url of [
      'https://example.com',
      'https://example.com/path',
      'https://sub.example.co.uk/',
    ]) {
      const result = checkCrawlableOrigin(url);
      expect(result.allowed).toBe(true);
    }
  });

  it('allows only the two explicit HTTP development origins', () => {
    expect(checkCrawlableOrigin('http://localhost:5173/path').allowed).toBe(true);
    expect(checkCrawlableOrigin('http://127.0.0.1:8080/').allowed).toBe(true);
    expect(checkCrawlableOrigin('http://192.168.1.2/').allowed).toBe(false);
    expect(checkCrawlableOrigin('http://example.com/').allowed).toBe(false);
  });

  it('rejects non-https schemes', () => {
    for (const url of [
      'http://example.com',
      'file:///etc/passwd',
      'ftp://example.com',
      'chrome-extension://abc/x',
      'javascript:alert(1)',
    ]) {
      expect(checkCrawlableOrigin(url).allowed).toBe(false);
    }
  });

  it('rejects localhost and local hostnames', () => {
    for (const url of [
      'https://localhost',
      'https://foo.localhost',
      'https://printer.local',
      'https://db.internal',
      'https://router.lan',
      'https://nas.home.arpa',
      'https://box.localdomain',
    ]) {
      const result = checkCrawlableOrigin(url);
      expect(result.allowed).toBe(false);
    }
  });

  it('rejects single-label hostnames (no dot, not localhost)', () => {
    expect(checkCrawlableOrigin('https://intranet/').allowed).toBe(false);
    expect(checkCrawlableOrigin('https://router/').allowed).toBe(false);
  });

  it('rejects private and loopback IPv4 literals with specific reasons', () => {
    for (const [host, label] of [
      ['127.0.0.1', 'loopback'],
      ['127.8.9.9', 'loopback'],
      ['0.0.0.0', 'loopback'],
      ['169.254.1.1', 'link-local'],
      ['10.1.2.3', 'private'],
      ['172.16.0.1', 'private'],
      ['172.31.255.255', 'private'],
      ['192.168.1.1', 'private'],
    ] as const) {
      const result = checkCrawlableOrigin(`https://${host}/`);
      expect(result.allowed, host).toBe(false);
      if (!result.allowed) expect(result.reason).toContain(label);
    }
  });

  it('rejects public IP literals and all IPv6 literals', () => {
    expect(checkCrawlableOrigin('https://93.184.216.34/').allowed).toBe(false);
    expect(checkCrawlableOrigin('https://[::1]/').allowed).toBe(false);
    expect(checkCrawlableOrigin('https://[fe80::1]/').allowed).toBe(false);
    expect(checkCrawlableOrigin('https://[fd00::1]/').allowed).toBe(false);
  });

  it('rejects unparseable input', () => {
    expect(checkCrawlableOrigin('not a url').allowed).toBe(false);
    expect(checkCrawlableOrigin('').allowed).toBe(false);
  });

  it('rejects 172.x ranges outside 16–31 (they are public) — but still rejects the IP literal', () => {
    // 172.32.x is public, but IP literals are rejected regardless.
    expect(checkCrawlableOrigin('https://172.32.0.1/').allowed).toBe(false);
  });
});

describe('isSameOriginUrl', () => {
  it('accepts same-origin URLs and rejects cross-origin ones', () => {
    expect(isSameOriginUrl('https://example.com/a', 'https://example.com')).toBe(true);
    expect(isSameOriginUrl('https://example.com:443/b', 'https://example.com')).toBe(true);
    expect(isSameOriginUrl('https://other.com/', 'https://example.com')).toBe(false);
    expect(isSameOriginUrl('http://example.com/', 'https://example.com')).toBe(false);
    expect(isSameOriginUrl('::bad::', 'https://example.com')).toBe(false);
  });
});

describe('permissionPatternForOrigin', () => {
  it('removes ports as Chrome match patterns ignore them', () => {
    expect(permissionPatternForOrigin('http://127.0.0.1:4321')).toBe('http://127.0.0.1/*');
    expect(permissionPatternForOrigin('https://example.com:8443')).toBe('https://example.com/*');
  });
});

describe('checkCrawlableOrigin — URL credentials (Phase 4, fail closed)', () => {
  it('rejects URLs with embedded user:pass credentials', () => {
    for (const url of [
      'https://user:pass@example.com/',
      'https://admin@example.com/',
      'https://user:pass@localhost/',
    ]) {
      const result = checkCrawlableOrigin(url);
      expect(result.allowed, url).toBe(false);
      if (!result.allowed) expect(result.reason).toContain('credentials');
    }
  });

  it('still accepts ordinary https URLs after the credentials check', () => {
    expect(checkCrawlableOrigin('https://example.com/').allowed).toBe(true);
  });
});
