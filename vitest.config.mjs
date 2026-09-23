// .mjs, not .js: this file uses ESM syntax and package.json has no "type":
// "module", so as a .js Vite loaded it as CommonJS, warned on every run, and
// would have broken outright once a future Vite major makes configLoader:
// 'native' the default. The extension is the whole fix; adding "type": "module"
// to package.json would have flipped every other .js in the repo to ESM.
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
