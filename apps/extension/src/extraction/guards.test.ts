import { describe, expect, it } from 'vitest';
import { isAnalyzableUrl, pageHost } from './guards';

describe('isAnalyzableUrl', () => {
  it.each(['https://example.com/', 'http://example.com/page?q=1', 'HTTPS://EXAMPLE.COM/'])(
    'accepts %s',
    (url) => {
      expect(isAnalyzableUrl(url)).toBe(true);
    },
  );

  it.each([
    'chrome://settings/',
    'chrome-extension://abc/popup.html',
    'edge://extensions/',
    'about:blank',
    'view-source:https://example.com/',
    'file:///C:/page.html',
    'javascript:void(0)',
    'devtools://devtools/bundled/inspector.html',
    'not a url',
    '',
    null,
    undefined,
  ])('rejects %s', (url) => {
    expect(isAnalyzableUrl(url)).toBe(false);
  });
});

describe('pageHost', () => {
  it('extracts the host', () => {
    expect(pageHost('https://example.com/page')).toBe('example.com');
  });

  it('returns null for unparseable input', () => {
    expect(pageHost('::not-a-url::')).toBeNull();
  });
});
