const path = require('path');
const webpack = require('webpack');
const createNextIntlPlugin = require('next-intl/plugin');

/**
 * Omit Keystatic from the webpack graph only for static export (BUILD_MODE=static).
 * Real routes stay in source; stubs replace them at compile time.
 */
function shouldStubKeystaticWebpackModules() {
  return process.env.BUILD_MODE === 'static';
}

/** When stubs apply, real app modules are swapped for `lib/stubs/*` (see webpack block below). */
const STATIC_EXPORT_STUBS = [
  // Every App Router API route: `output: 'export'` cannot use `force-dynamic` or server-only handlers.
  [/app[\\/]api[\\/].+[\\/]route\.(ts|tsx|js)$/, 'api-route-static.ts'],
  [/app[\\/]keystatic[\\/]layout\.tsx$/, 'keystatic-layout-static.tsx'],
  [/app[\\/]keystatic[\\/]\[\[\.\.\.params\]\][\\/]page\.tsx$/, 'keystatic-page-static.tsx'],
  [/app[\\/]preview[\\/]start[\\/]route\.ts$/, 'preview-start-static.ts'],
  [/app[\\/]preview[\\/]end[\\/]route\.ts$/, 'preview-end-static.ts'],
  [/packages[\\/]react-review-comments[\\/]src[\\/]ReviewCommentsShell\.tsx$/, 'annotation-shell-static.jsx'],
];

const baseConfig = {
  // Smaller server/client bundles and faster compiles for barrel-import icon packages.
  experimental: {
    optimizePackageImports: ['lucide-react', 'react-icons'],
  },
  // Native / ESM-heavy deps: bundling breaks default export interop (e.g. "(0 , cH.default) is not a function" during OG image generation).
  // Keystatic must read KEYSTATIC_* from real process.env at runtime (Railway secrets), not from build-time inlining.
  serverExternalPackages: ['sharp', 'satori', '@keystatic/core', '@keystatic/next'],
  transpilePackages: ['next-mdx-remote', '@activistchecklist/react-review-comments'],
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname),
    };

    // Exclude fs from client-side bundles
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };

    // Static export: Keystatic admin UI still pulls @keystatic/next via PageClient unless we
    // replace page + layout. All `app/api/**/route.*` are replaced with `api-route-static.ts`:
    // `output: 'export'` forbids `force-dynamic` in route modules, so real handlers cannot ship.
    if (shouldStubKeystaticWebpackModules()) {
      const stubDir = path.join(__dirname, 'lib', 'stubs');
      for (const [pathRe, file] of STATIC_EXPORT_STUBS) {
        config.plugins.push(
          new webpack.NormalModuleReplacementPlugin(
            // Match `.../app/...` on POSIX or Windows (same as original `/[\\/]app…/` patterns).
            new RegExp(`[\\\\/]${pathRe.source}`),
            path.join(stubDir, file)
          )
        );
      }
    }

    return config;
  },
};

// All of these only apply for static builds
if (process.env.BUILD_MODE === 'static') {
  baseConfig.output = 'export';
  baseConfig.distDir = 'out';
  delete baseConfig.images.domains;
  baseConfig.images.loader = 'custom';
  baseConfig.images.loaderFile = './utils/imageLoader.js';
}

// i18n is handled by App Router [locale] dynamic segment + next-intl.
// Static export generates /en/ and /es/ directories; .htaccess rewrites bare URLs to /en/.

const nextConfig = process.env.NODE_ENV === 'development'
  ? {
    ...baseConfig,
    rewrites: async () => ([
      {
        source: '/api-server/:path*',
        destination: 'http://localhost:4321/api-server/:path*'
      }
    ])
  }
  : baseConfig;

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');
module.exports = withNextIntl(nextConfig);