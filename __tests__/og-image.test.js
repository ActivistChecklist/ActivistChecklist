import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('OG Image Configuration', () => {
  describe('GUIDE_ICONS', () => {
    it('should export all required guide icons', async () => {
      const { GUIDE_ICONS } = await import('../config/icons.js');

      const requiredKeys = [
        'essentials',
        'protest',
        'travel',
        'signal',
        'secondary',
        'emergency',
        'spyware',
        'organizing',
        'research',
        'federal',
        'doxxing',
        'action',
        'ice',
      ];

      for (const key of requiredKeys) {
        expect(GUIDE_ICONS[key], `Missing icon for "${key}"`).toBeDefined();
        // Icons can be functions (react-icons) or objects (lucide-react)
        const iconType = typeof GUIDE_ICONS[key];
        expect(
          iconType === 'function' || iconType === 'object',
          `Icon for "${key}" should be a function or object, got ${iconType}`,
        ).toBe(true);
      }
    });

    it('should export a DEFAULT_ICON', async () => {
      const { DEFAULT_ICON } = await import('../config/icons.js');
      expect(DEFAULT_ICON).toBeDefined();
      expect(typeof DEFAULT_ICON).toBe('function');
    });
  });

  describe('Icon SVG Extraction', () => {
    it('should extract valid SVG data from solid icons', async () => {
      const { IoShield } = await import('react-icons/io5');
      const el = IoShield({});

      expect(el.props.attr.viewBox).toBeDefined();
      expect(el.props.children).toBeDefined();
      expect(el.props.children.length).toBeGreaterThan(0);

      // Solid icons use fill-based paths (no strokeWidth)
      const children = Array.isArray(el.props.children) ? el.props.children : [el.props.children];
      const hasPaths = children.some((child) => child.type === 'path');
      expect(hasPaths).toBe(true);
    });

    it('should extract valid SVG data from fill-based icons', async () => {
      const { IoEyeOff } = await import('react-icons/io5');
      const el = IoEyeOff({});

      expect(el.props.attr.viewBox).toBeDefined();
      expect(el.props.children).toBeDefined();
      expect(el.props.children.length).toBeGreaterThan(0);

      // Fill-based icons should NOT have strokeWidth
      const hasStroke = el.props.children.some((child) => child.props?.strokeWidth);
      expect(hasStroke).toBe(false);
    });

    it('should handle solid lock icon SVG elements', async () => {
      const { IoLockClosed } = await import('react-icons/io5');
      const el = IoLockClosed({});

      const children = Array.isArray(el.props.children) ? el.props.children : [el.props.children];
      const elementTypes = children.map((child) => child.type);

      // Solid lock icon uses path elements
      expect(elementTypes).toContain('path');
    });

    it('should handle lucide-react icons', async () => {
      const { Landmark } = await import('lucide-react');

      // Lucide-react exports forwardRef components (objects), not plain functions
      expect(Landmark).toBeDefined();
      expect(typeof Landmark).toBe('object');
      // Check it has the render property of a forwardRef component
      expect(Landmark.$$typeof || Landmark.render).toBeDefined();
    });
  });

  describe('Default OG Image Pages', () => {
    it('should have matching lists in og-image.js and api/og-image.js', () => {
      // These pages should use the default OG image
      const expectedPages = [
        'home',
        '',
        'privacy',
        'contact',
        'resources',
        'about',
        'checklists',
        'flyer',
      ];

      // Read the files to check the lists match
      const ogImageContent = fs.readFileSync(path.join(process.cwd(), 'lib/og-image.js'), 'utf-8');
      const apiContent = fs.readFileSync(
        path.join(process.cwd(), 'app/api/og-image/route.ts'),
        'utf-8',
      );

      // Check that both files contain the same pages
      for (const page of expectedPages) {
        expect(ogImageContent).toContain(`'${page}'`);
        expect(apiContent).toContain(`'${page}'`);
      }
    });
  });

  describe('getOgImagePathForSlug', () => {
    const card = { title: 'Prepare for an Arrestable Action', pageType: 'guide' };

    it('uses the default image for default slugs and when there is no title', async () => {
      const { getOgImagePathForSlug } = await import('../lib/og-image.js');
      expect(getOgImagePathForSlug('', card)).toBe('/images/og-image.png');
      expect(getOgImagePathForSlug('flyer', card)).toBe('/images/og-image.png');
      expect(getOgImagePathForSlug('protest')).toBe('/images/og-image.png');
    });

    it('puts a content hash in the file name', async () => {
      const { getOgImagePathForSlug } = await import('../lib/og-image.js');
      expect(getOgImagePathForSlug('action', card)).toMatch(
        /^\/images\/og\/action-[0-9a-f]{10}\.png$/,
      );
      expect(getOgImagePathForSlug('nested/slug', card)).toMatch(
        /^\/images\/og\/nested-slug-[0-9a-f]{10}\.png$/,
      );
      expect(getOgImagePathForSlug('action/', card)).toBe(getOgImagePathForSlug('action', card));
    });

    it('changes the URL when the title or page type changes, so social sites refetch', async () => {
      const { getOgImagePathForSlug } = await import('../lib/og-image.js');
      const original = getOgImagePathForSlug('action', card);
      expect(getOgImagePathForSlug('action', { ...card })).toBe(original);
      expect(
        getOgImagePathForSlug('action', { ...card, title: 'Prepare for a Direct Action' }),
      ).not.toBe(original);
      expect(getOgImagePathForSlug('action', { ...card, pageType: 'page' })).not.toBe(original);
    });
  });

  describe('generateOgImageForRoute', () => {
    let tmpDir;
    let ogDir;

    beforeEach(() => {
      // Render into a private temp copy of public/ so the test never touches the real cache.
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'og-image-test-'));
      const realPublic = path.join(process.cwd(), 'public');
      fs.mkdirSync(path.join(tmpDir, 'public', 'images'), { recursive: true });
      fs.symlinkSync(path.join(realPublic, 'fonts'), path.join(tmpDir, 'public', 'fonts'));
      fs.symlinkSync(
        path.join(realPublic, 'images', 'logo-stacked-color-transparent.png'),
        path.join(tmpDir, 'public', 'images', 'logo-stacked-color-transparent.png'),
      );
      ogDir = path.join(tmpDir, 'public', 'images', 'og');
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    });

    afterEach(() => {
      vi.restoreAllMocks();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("regenerates when the title changes and removes only that slug's stale images", async () => {
      const { generateOgImageForRoute } = await import('../lib/og-image.js');
      fs.mkdirSync(ogDir, { recursive: true });
      // Left behind by the old unhashed generator, plus a neighbour slug that shares a prefix.
      fs.writeFileSync(path.join(ogDir, 'action.png'), 'legacy');
      fs.writeFileSync(path.join(ogDir, 'action-plan-0123456789.png'), 'other slug');

      const oldPath = await generateOgImageForRoute({
        title: 'Prepare for a Direct Action',
        pageType: 'guide',
        slug: 'action',
      });
      const newPath = await generateOgImageForRoute({
        title: 'Prepare for an Arrestable Action',
        pageType: 'guide',
        slug: 'action',
      });

      expect(newPath).not.toBe(oldPath);
      expect(fs.readdirSync(ogDir).sort()).toEqual(
        [path.basename(newPath), 'action-plan-0123456789.png'].sort(),
      );
      const png = fs.readFileSync(path.join(ogDir, path.basename(newPath)));
      expect(png.subarray(1, 4).toString()).toBe('PNG');
    }, 30_000);

    it('reuses the cached image when nothing changed', async () => {
      const { generateOgImageForRoute } = await import('../lib/og-image.js');
      const params = { title: 'Signal', pageType: 'guide', slug: 'signal' };
      const first = await generateOgImageForRoute(params);
      const filePath = path.join(ogDir, path.basename(first));
      fs.writeFileSync(filePath, 'cached');

      expect(await generateOgImageForRoute(params)).toBe(first);
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('cached');
    }, 30_000);
  });

  describe('Slug to Icon Matching', () => {
    it('should match common slug patterns to correct icons', async () => {
      const { GUIDE_ICONS } = await import('../config/icons.js');

      // Test that slugs would match the expected icons
      const slugTests = [
        { slug: 'protest', expectedKey: 'protest' },
        { slug: 'signal', expectedKey: 'signal' },
        { slug: 'secondary', expectedKey: 'secondary' },
        { slug: 'organizing', expectedKey: 'organizing' },
        { slug: 'spyware', expectedKey: 'spyware' },
        { slug: 'doxxing', expectedKey: 'doxxing' },
        { slug: 'action', expectedKey: 'action' },
      ];

      for (const { slug, expectedKey } of slugTests) {
        // Simulate the matching logic from getIconForSlug
        const normalizedSlug = slug.toLowerCase().replace(/\//g, '');
        let matchedKey = null;

        for (const key of Object.keys(GUIDE_ICONS)) {
          if (normalizedSlug.includes(key)) {
            matchedKey = key;
            break;
          }
        }

        expect(matchedKey, `Slug "${slug}" should match key "${expectedKey}"`).toBe(expectedKey);
      }
    });
  });

  describe('Navigation Icons Consistency', () => {
    it('should have icons defined for all NAV_ITEMS with icon property', async () => {
      const { NAV_ITEMS } = await import('../config/navigation.js');

      const itemsWithIcons = Object.values(NAV_ITEMS).filter((item) => item.icon !== undefined);

      for (const item of itemsWithIcons) {
        expect(item.icon, `NAV_ITEMS.${item.key} has undefined icon`).toBeDefined();
        // Icons can be functions (react-icons) or objects (lucide-react forwardRef)
        const iconType = typeof item.icon;
        expect(
          iconType === 'function' || iconType === 'object',
          `NAV_ITEMS.${item.key} icon should be a function or object, got ${iconType}`,
        ).toBe(true);
      }
    });
  });
});

describe('API Route Security', () => {
  it('should only be available in development', () => {
    const apiContent = fs.readFileSync(
      path.join(process.cwd(), 'app/api/og-image/route.ts'),
      'utf-8',
    );

    // Check that the dev-only check exists
    expect(apiContent).toContain("process.env.NODE_ENV !== 'development'");
    expect(apiContent).toContain('404');
  });
});
