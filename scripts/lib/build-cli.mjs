/**
 * Shared terminal styling for build / postbuild scripts (pnpm buildstatic chain).
 * Use sectionStart → … work … → sectionEnd for a consistent flow.
 */
import chalk from 'chalk';

export const BUILD_CLI_WIDTH = 62;

export function hr() {
  console.log(chalk.dim('─'.repeat(BUILD_CLI_WIDTH)));
}

/** Primary section header (blank line before + after rule). */
export function sectionStart(emoji, title) {
  console.log('');
  hr();
  console.log(`${emoji}  ${chalk.bold.white(title)}`);
  hr();
}

/**
 * Closing summary for a section. `lines` is a string or array of strings.
 * Prints ✓ (green) or ✗ (red) per line, then a rule and blank line.
 */
export function sectionEnd(ok, lines) {
  const list = Array.isArray(lines) ? lines : [lines];
  const mark = ok ? chalk.green('✓') : chalk.red('✗');
  const paint = ok ? chalk.green : chalk.red;
  for (const line of list) {
    console.log(`  ${mark}  ${paint(line)}`);
  }
  hr();
  console.log('');
}

/** Indented secondary line (e.g. counts, paths). */
export function detail(text) {
  console.log(chalk.gray(`     ${text}`));
}

export function warnDetail(text) {
  console.log(chalk.yellow(`     ⚠  ${text}`));
}

/** In-section heading (no full-width rules). */
export function subsection(emoji, title) {
  console.log('');
  console.log(`${emoji}  ${chalk.bold.cyan(title)}`);
}

export function attention(emoji, title) {
  console.log('');
  console.log(`${emoji}  ${chalk.bold.yellow(title)}`);
}
