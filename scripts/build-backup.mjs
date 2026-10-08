import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { sectionStart, sectionEnd, detail, warnDetail } from './lib/build-cli.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BACKUP_DIR = 'buildbackups';
const MAX_BACKUPS = 50;

function getGitHash() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    warnDetail('Could not read git revision — backup name will omit hash');
    return '';
  }
}

function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function createBackupName() {
  const timestamp = getTimestamp();
  const gitHash = getGitHash();
  const hashSuffix = gitHash ? `-${gitHash}` : '';
  return `out-${timestamp}${hashSuffix}`;
}

function rotateBackups() {
  if (!fs.existsSync(BACKUP_DIR)) {
    return 0;
  }

  const backups = fs
    .readdirSync(BACKUP_DIR)
    .filter((item) => item.startsWith('out-'))
    .map((item) => ({
      name: item,
      path: path.join(BACKUP_DIR, item),
      stats: fs.statSync(path.join(BACKUP_DIR, item)),
    }))
    .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());

  let removed = 0;
  if (backups.length > MAX_BACKUPS) {
    const toDelete = backups.slice(MAX_BACKUPS);
    for (const backup of toDelete) {
      try {
        fs.rmSync(backup.path, { recursive: true, force: true });
        removed += 1;
      } catch (error) {
        warnDetail(`Could not delete old backup ${backup.name}: ${error.message}`);
      }
    }
  }
  return removed;
}

function createBackup() {
  sectionStart('💾', 'Build backup — copy out/ snapshot');
  const sourcePath = path.resolve(__dirname, '..', 'out');

  if (!fs.existsSync(sourcePath)) {
    detail(`Missing: ${sourcePath}`);
    sectionEnd(false, ['No out/ directory — nothing to back up']);
    process.exit(1);
  }

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const backupName = createBackupName();
  const backupPath = path.join(BACKUP_DIR, backupName);

  try {
    execSync(`cp -r "${sourcePath}" "${backupPath}"`, { stdio: 'pipe' });
    detail(`Created ${path.join(BACKUP_DIR, backupName)}`);
    const removed = rotateBackups();
    sectionEnd(true, [
      `Backup: ${backupName}`,
      removed > 0
        ? `Rotated: removed ${removed} old out-* backup(s)`
        : `Rotation: under ${MAX_BACKUPS} out-* backups`,
    ]);
  } catch (error) {
    sectionEnd(false, [`Backup failed: ${error.message}`]);
    process.exit(1);
  }
}

createBackup();
