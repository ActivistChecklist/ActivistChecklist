import { describe, it, expect } from 'vitest';
import { applyPaywallBypassHref, isPaywallBypassActiveForUrl } from '../lib/paywall-bypass-url';

describe('applyPaywallBypassHref', () => {
  describe('unwall sites', () => {
    it('rewrites an article to an unwall.app permalink without the scheme', () => {
      expect(
        applyPaywallBypassHref(
          'https://www.nytimes.com/2026/01/21/us/politics/ice-warrant-whistleblower.html',
        ),
      ).toBe(
        'https://unwall.app/www.nytimes.com/2026/01/21/us/politics/ice-warrant-whistleblower.html',
      );
    });

    it('strips an http scheme too', () => {
      expect(applyPaywallBypassHref('http://www.syracuse.com/news/2026/06/story.html')).toBe(
        'https://unwall.app/www.syracuse.com/news/2026/06/story.html',
      );
    });

    it('keeps the query string', () => {
      expect(
        applyPaywallBypassHref(
          'https://www.washingtonpost.com/technology/2025/10/17/story/?itid=x',
        ),
      ).toBe('https://unwall.app/www.washingtonpost.com/technology/2025/10/17/story/?itid=x');
    });

    it('matches subdomains of a configured site', () => {
      expect(applyPaywallBypassHref('https://cooking.nytimes.com/recipes/1')).toBe(
        'https://unwall.app/cooking.nytimes.com/recipes/1',
      );
    });
  });

  describe('wayback sites', () => {
    it('uses the oldest Wayback snapshot for wayback_oldest', () => {
      expect(applyPaywallBypassHref('https://www.404media.co/some/article/')).toBe(
        'https://web.archive.org/web/0/https://www.404media.co/some/article/',
      );
    });

    it('uses the newest Wayback snapshot for wayback_newest', () => {
      expect(applyPaywallBypassHref('https://www.forbes.com/sites/x/2026/01/01/story/')).toBe(
        'https://web.archive.org/web/https://www.forbes.com/sites/x/2026/01/01/story/',
      );
    });
  });

  describe('links left alone', () => {
    it('does not rewrite a publisher homepage', () => {
      expect(applyPaywallBypassHref('https://www.nytimes.com/')).toBe('https://www.nytimes.com/');
      expect(applyPaywallBypassHref('https://www.washingtonpost.com')).toBe(
        'https://www.washingtonpost.com',
      );
    });

    it('does not match lookalike hosts', () => {
      expect(applyPaywallBypassHref('https://notnytimes.com/a')).toBe('https://notnytimes.com/a');
      expect(applyPaywallBypassHref('https://nytimes.com.example.org/a')).toBe(
        'https://nytimes.com.example.org/a',
      );
    });

    it('does not rewrite a link that already goes through unwall or Wayback', () => {
      const unwall = 'https://unwall.app/www.nytimes.com/2026/01/21/story.html';
      const wayback = 'https://web.archive.org/web/0/https://www.404media.co/some/article/';
      expect(applyPaywallBypassHref(unwall)).toBe(unwall);
      expect(applyPaywallBypassHref(wayback)).toBe(wayback);
    });

    it('leaves unconfigured sites, site paths and non-http links unchanged', () => {
      expect(applyPaywallBypassHref('https://apnews.com/article/x')).toBe(
        'https://apnews.com/article/x',
      );
      expect(applyPaywallBypassHref('/guides/ice/')).toBe('/guides/ice/');
      expect(applyPaywallBypassHref('mailto:a@b.co')).toBe('mailto:a@b.co');
      expect(applyPaywallBypassHref(undefined)).toBe(undefined);
    });
  });
});

describe('isPaywallBypassActiveForUrl', () => {
  it('is true for an article on a configured site and false for its homepage', () => {
    expect(isPaywallBypassActiveForUrl('https://www.syracuse.com/news/2026/06/story.html')).toBe(
      true,
    );
    expect(isPaywallBypassActiveForUrl('https://www.syracuse.com/')).toBe(false);
  });
});
