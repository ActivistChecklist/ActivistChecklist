#!/usr/bin/env node
/**
 * fetch-external-images.mjs
 *
 * Downloads external images at build time so no third-party assets load at runtime.
 * Fetches fresh each build. Falls back to the cached file if the network is unavailable.
 * Fails the build only if a fetch fails AND no cached copy exists.
 *
 * Add new entries to EXTERNAL_IMAGES below.
 *
 * Usage: node scripts/fetch-external-images.mjs
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

/**
 * External images to cache locally.
 * - url: source URL
 * - dest: path relative to public/
 */
const EXTERNAL_IMAGES = [
  {
    url: 'https://img.shields.io/badge/dynamic/json?color=blue&label=Spanish&style=flat&query=%24.progress.0.data.translationProgress&url=https%3A%2F%2Fbadges.awesome-crowdin.com%2Fstats-17633866-883364.json',
    dest: 'images/badges/crowdin-spanish.svg',
  },
];

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 10000, headers: { Accept: 'image/svg+xml,image/*,*/*' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

async function main() {
  let failed = false;

  for (const { url, dest } of EXTERNAL_IMAGES) {
    const outputPath = path.join(PUBLIC_DIR, dest);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    try {
      const data = await fetchUrl(url);
      fs.writeFileSync(outputPath, data);
      console.log(`✅ Fetched: ${dest}`);
    } catch (err) {
      if (fs.existsSync(outputPath)) {
        console.warn(`⚠️  Could not fetch ${dest} (${err.message}) — using cached copy`);
      } else {
        console.error(`❌ Could not fetch ${dest} and no cached copy exists: ${err.message}`);
        failed = true;
      }
    }
  }

  if (failed) process.exit(1);
}

main();
