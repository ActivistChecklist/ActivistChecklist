import { configDefaults, defineConfig } from 'vitest/config'
import path from 'path'

const isGitHubActions = process.env.GITHUB_ACTIONS === 'true'

export default defineConfig({
  test: {
    globals: true,
    exclude: [
      ...configDefaults.exclude,
      ...(isGitHubActions ? ['__tests__/og-image.test.js'] : []),
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname),
    },
  },
})
