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
