// Vitest reporter for the pre-commit hook (.husky/pre-commit). A clean run
// prints one line instead of the banner and summary block. Anything else
// (a failed test, a file that fails to load, an unhandled error) falls through
// to Vitest's own `minimal` reporter, so the failing test, its diff and stack
// still print in full. `pnpm test` and CI keep the default reporter.

import { MinimalReporter } from 'vitest/node';

export default class HookReporter extends MinimalReporter {
  onInit(ctx) {
    // Skip the "RUN v5.x /path/to/repo" banner the base reporter prints here.
    const { printBanner } = ctx.logger;
    ctx.logger.printBanner = () => {};
    try {
      super.onInit(ctx);
    } finally {
      ctx.logger.printBanner = printBanner;
    }
  }

  onTestRunStart(specifications) {
    super.onTestRunStart(specifications);
    this.runStart = performance.now();
  }

  onTestRunEnd(testModules, unhandledErrors, reason) {
    const clean =
      reason === 'passed' &&
      unhandledErrors.length === 0 &&
      testModules.length > 0 &&
      testModules.every((testModule) => testModule.ok());
    if (!clean) {
      super.onTestRunEnd(testModules, unhandledErrors, reason);
      return;
    }

    let passed = 0;
    let skipped = 0;
    for (const testModule of testModules) {
      for (const test of testModule.children.allTests()) {
        if (test.result().state === 'passed') passed++;
        else skipped++;
      }
    }
    const seconds = ((performance.now() - this.runStart) / 1000).toFixed(1);
    const skippedNote = skipped ? `, ${skipped} skipped` : '';
    this.log(`✓ ${passed} tests passed${skippedNote} (${testModules.length} files) in ${seconds}s`);
  }
}
