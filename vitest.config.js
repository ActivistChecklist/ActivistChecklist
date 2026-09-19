// NOTE: this file uses ESM syntax but package.json has no "type": "module",
// so Vite loads it as CommonJS and warns on every run. A future Vite major
// makes configLoader: 'native' the default and this stops working. Fix by
// renaming this file to vitest.config.mjs.
import { configDefaults, defineConfig } from 'vitest/config'
import path from 'path'

const isGitHubActions = process.env.GITHUB_ACTIONS === 'true'

export default defineConfig({
  test: {
    globals: true,
    exclude: [
      ...configDefaults.exclude,
      // Workspace packages run their own Vitest (e.g. jsdom for highlightDom).
      'packages/**',
      ...(isGitHubActions ? ['__tests__/og-image.test.js'] : []),
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname),
    },
  },
})
