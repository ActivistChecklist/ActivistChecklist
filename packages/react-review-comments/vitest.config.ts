import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    // Default `forks` pool can fail to resolve `undici/lib/...` inside `jsdom` on Linux CI
    // (MODULE_NOT_FOUND for wrap-handler.js). Threads share the main module graph.
    pool: 'threads',
  },
});
