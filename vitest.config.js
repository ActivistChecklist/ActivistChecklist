import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    // Workspace packages run their own Vitest (e.g. jsdom for highlightDom).
    exclude: ['**/node_modules/**', '**/dist/**', 'packages/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname),
    },
  },
})
