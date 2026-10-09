import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import imageLoader from '../utils/imageLoader';

describe('imageLoader', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('development mode', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('returns src with width and quality params', () => {
      const result = imageLoader({
        src: 'https://cdn.example.com/assets/test.png',
        width: 800,
        quality: 90,
      });
      expect(result).toBe('https://cdn.example.com/assets/test.png?w=800&q=90');
    });

    it('uses default quality of 75 when not specified', () => {
      const result = imageLoader({ src: 'https://cdn.example.com/assets/test.png', width: 600 });
      expect(result).toBe('https://cdn.example.com/assets/test.png?w=600&q=75');
    });
  });

  describe('production mode', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('extracts filename and prefixes with /images/', () => {
      const result = imageLoader({ src: 'https://cdn.example.com/f/123/abc/test.png', width: 800 });
      expect(result).toBe('/images/test.png');
    });

    it('handles URLs with complex paths', () => {
      const result = imageLoader({
        src: 'https://cdn.example.com/f/123/abc/def/image-file.jpg',
        width: 400,
      });
      expect(result).toBe('/images/image-file.jpg');
    });

    it('handles local image paths', () => {
      const result = imageLoader({ src: '/images/logo.png', width: 200 });
      expect(result).toBe('/images/logo.png');
    });
  });
});
