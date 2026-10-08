import crypto from 'crypto';
import chalk from 'chalk';

export const createHash = (data) => {
  return crypto.createHash('md5').update(data).digest('hex');
};

export const logger = {
  info: (msg) => console.log(chalk.blue(msg)),
  success: (msg) => console.log(chalk.green(msg)),
  error: (msg) => console.error(chalk.red(msg)),
  warn: (msg) => console.log(chalk.yellow(msg)),
  detail: (msg) => console.log(chalk.gray(msg)),
  header: (msg) => console.log(chalk.blue.bold(msg)),
};

export const formatProgress = (current, total) => {
  const progress = Math.floor((current / total) * 100);
  return `${progress}% (${current}/${total})`;
};
