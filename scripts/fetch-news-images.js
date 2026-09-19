#!/usr/bin/env node

/**
 * fetch-news-images.js
 *
 * Downloads and processes images for news items.
 * Run this when adding a new news item, then commit the resulting image.
 *
 * Image source priority per article:
 *   1. imageOverride frontmatter (local file path or external URL)
 *   2. Open Graph image scraped from the article URL
 *
 * Output: public/images/news/{slug}.jpg  (720px wide, metadata-stripped JPEG)
 *
 * Usage:
 *   node scripts/fetch-news-images.js              # process only missing images
 *   node scripts/fetch-news-images.js --force      # re-download all images
 *   node scripts/fetch-news-images.js --test       # process first missing image only
 *   node scripts/fetch-news-images.js --quiet      # suppress non-error output
 *   node scripts/fetch-news-images.js --slug=SLUG  # process one item by filename slug
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const matter = require('gray-matter');
const ogs = require('open-graph-scraper');

// Try to load sharp, but handle gracefully if it fails
let sharp;
try {
  sharp = require('sharp');
} catch (error) {
  const isVercel = process.env.VERCEL === '1';
  if (isVercel) {
    console.warn('⚠️ Sharp not available on Vercel, image processing will be skipped:', error.message);
  } else {
    console.error('❌ Sharp is required but not available:', error.message);
    console.error('💡 Run: pnpm add sharp');
    throw new Error('Sharp is required');
  }
  sharp = null;
}

// Try to load MetadataStripper for thorough metadata removal
let MetadataStripper;
try {
  MetadataStripper = require('../lib/metadata-library.cjs').MetadataStripper;
} catch (error) {
  MetadataStripper = null;
}

const NEWS_IMAGES_DIR = path.join(__dirname, '..', 'public', 'images', 'news');
const CONTENT_DIR = path.join(__dirname, '..', 'content', 'en', 'news');

// ─── MDX Loading ─────────────────────────────────────────────

function walkDir(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else if (entry.name.endsWith('.mdx')) {
      results.push(fullPath);
    }
  }
  return results;
}

function loadNewsItems() {
  return walkDir(CONTENT_DIR).map(filePath => {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { data: frontmatter } = matter(raw);
    const slug = path.basename(filePath, '.mdx');
    return { slug, frontmatter };
  });
}

// ─── Image Source Resolution ──────────────────────────────────

/**
 * Return the image source for a news item:
 *   { type: 'local', value: '/public/...' }  — copy from local file
 *   { type: 'url',   value: 'https://...' }  — download from URL
 *   { type: 'none' }                          — scrape OG from article URL
 */
function getImageSource(frontmatter) {
  const override = frontmatter.imageOverride;
  if (!override) return { type: 'none' };

  // Local path (starts with /)
  if (typeof override === 'string' && override.startsWith('/')) {
    const localPath = path.join(__dirname, '..', 'public', override.replace(/^\//, ''));
    return { type: 'local', value: localPath };
  }

  // External URL
  if (typeof override === 'string' && (override.startsWith('http://') || override.startsWith('https://'))) {
    return { type: 'url', value: override };
  }

  return { type: 'none' };
}

// ─── OG Scraping ─────────────────────────────────────────────

async function getSocialGraphImage(url, quietMode = false) {
  if (!url) return null;
  try {
    const { error, result } = await ogs({
      url,
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'DNT': '1',
      },
    });
    if (error) {
      if (!quietMode) console.warn(`⚠️ OG scrape failed for ${url}:`, error);
      return null;
    }
    return result?.ogImage?.[0]?.url
      || result?.twitterImage?.[0]?.url
      || result?.ogImageSecureUrl
      || result?.ogImageUrl
      || null;
  } catch (err) {
    if (!quietMode) console.warn(`⚠️ OG scrape error for ${url}:`, err.message);
    return null;
  }
}

// ─── Image Processing ─────────────────────────────────────────

async function processImageBuffer(imageBuffer, outputPath, quietMode = false) {
  if (!sharp) {
    fs.writeFileSync(outputPath, imageBuffer);
    return;
  }

  // Validate dimensions
  const metadata = await sharp(imageBuffer).metadata();
  const MAX_DIMENSION = 20000;
  if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
    throw new Error('Image dimensions too large');
  }

  // Strip metadata
  let strippedBuffer = imageBuffer;
  if (MetadataStripper) {
    try {
      const stripper = new MetadataStripper({ verbose: false });
      strippedBuffer = await stripper.stripImageMetadata(imageBuffer);
    } catch (err) {
      if (!quietMode) console.warn(`⚠️ Advanced metadata stripping failed, using basic: ${err.message}`);
    }
  }

  // Resize and convert to JPEG
  const processed = await sharp(strippedBuffer)
    .resize(720, null, { withoutEnlargement: true, fit: 'inside' })
    .withMetadata(false)
    .jpeg({ quality: 85, progressive: true, mozjpeg: true })
    .toBuffer();

  fs.writeFileSync(outputPath, processed);
}

async function downloadAndProcess(imageUrl, outputPath, quietMode = false) {
  return new Promise((resolve, reject) => {
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    const chunks = [];
    let totalSize = 0;

    try {
      const urlObj = new URL(imageUrl);
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        reject(new Error('Invalid URL protocol'));
        return;
      }
    } catch {
      reject(new Error('Invalid URL format'));
      return;
    }

    const request = https.get(imageUrl, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'image/*',
        'Connection': 'close',
      },
    }, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const contentType = response.headers['content-type'];
      if (!contentType?.startsWith('image/')) {
        reject(new Error('Invalid content type'));
        return;
      }
      const contentLength = response.headers['content-length'];
      if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
        reject(new Error('File too large'));
        return;
      }

      response.on('data', (chunk) => {
        totalSize += chunk.length;
        if (totalSize > MAX_FILE_SIZE) {
          request.destroy();
          reject(new Error('File too large during download'));
          return;
        }
        chunks.push(chunk);
      });

      response.on('end', async () => {
        try {
          await processImageBuffer(Buffer.concat(chunks), outputPath, quietMode);
          resolve();
        } catch (err) {
          reject(new Error(`Image processing failed: ${err.message}`));
        }
      });

      response.on('error', reject);
    });

    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function copyAndProcess(localSrcPath, outputPath, quietMode = false) {
  if (!fs.existsSync(localSrcPath)) {
    throw new Error(`Local source file not found: ${localSrcPath}`);
  }
  // If source is already a JPEG and small enough, check if processing is needed
  const imageBuffer = fs.readFileSync(localSrcPath);
  await processImageBuffer(imageBuffer, outputPath, quietMode);
}

// ─── Logging ──────────────────────────────────────────────────

function log(message, quietMode = false) {
  if (!quietMode) console.log(message);
}

// ─── Main ─────────────────────────────────────────────────────

function parseSlugArg(args) {
  const eq = args.find((a) => a.startsWith('--slug='));
  if (eq) return eq.slice('--slug='.length);
  const idx = args.indexOf('--slug');
  if (idx >= 0 && args[idx + 1]) return args[idx + 1];
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const testMode = args.includes('--test') || args.includes('-t');
  const forceMode = args.includes('--force') || args.includes('-f');
  const quietMode = args.includes('--quiet') || args.includes('-q');
  const slugOnly = parseSlugArg(args);

  process.on('SIGINT', () => { log('🛑 Interrupted, exiting...', quietMode); process.exit(0); });

  // Ensure output directory exists
  if (!fs.existsSync(NEWS_IMAGES_DIR)) {
    fs.mkdirSync(NEWS_IMAGES_DIR, { recursive: true });
  }

  log('🔍 Loading news items from MDX files...', quietMode);
  let items = loadNewsItems();
  if (slugOnly) {
    items = items.filter((i) => i.slug === slugOnly);
    if (items.length === 0) {
      console.error(`❌ No news item with slug "${slugOnly}" (expected an MDX under content/en/news/).`);
      process.exit(1);
    }
    log(`📰 Single-slug mode: ${slugOnly}`, quietMode);
  } else {
    log(`📰 Found ${items.length} news items`, quietMode);
  }

  if (forceMode) log('🔄 Force mode — will re-process all images', quietMode);

  let processed = 0, skipped = 0, errors = 0;
  const missing = [];

  for (const { slug, frontmatter } of items) {
    const outputPath = path.join(NEWS_IMAGES_DIR, `${slug}.jpg`);

    if (!forceMode && fs.existsSync(outputPath)) {
      log(`✅ Already exists: ${slug}`, quietMode);
      skipped++;
      continue;
    }

    const source = getImageSource(frontmatter);
    log(`🖼️  Processing: ${slug} (source: ${source.type})`, quietMode);

    try {
      if (source.type === 'local') {
        await copyAndProcess(source.value, outputPath, quietMode);
        log(`   📁 Copied from local: ${source.value}`, quietMode);
        processed++;
      } else if (source.type === 'url') {
        await downloadAndProcess(source.value, outputPath, quietMode);
        log(`   🌐 Downloaded from URL override`, quietMode);
        processed++;
      } else {
        // Scrape OG image from article URL
        const articleUrl = frontmatter.url;
        if (!articleUrl) {
          log(`⏭️  Skipping ${slug}: no URL`, quietMode);
          skipped++;
          continue;
        }
        const ogImageUrl = await getSocialGraphImage(articleUrl, quietMode);
        if (ogImageUrl) {
          await downloadAndProcess(ogImageUrl, outputPath, quietMode);
          log(`   🔗 Downloaded OG image`, quietMode);
          processed++;
        } else {
          log(`❌ No image found for: ${slug}`, quietMode);
          errors++;
          missing.push({ slug, url: articleUrl });
        }
      }

      // Polite delay between network requests
      if (source.type !== 'local') {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (testMode) {
        log('🧪 Test mode: stopping after one item', quietMode);
        break;
      }
    } catch (err) {
      console.error(`❌ Error processing ${slug}:`, err.message);
      errors++;
      if (source.type === 'none') missing.push({ slug, url: frontmatter.url });
      if (testMode) break;
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   ✅ Processed: ${processed}`);
  console.log(`   ⏭️  Skipped:   ${skipped}`);
  console.log(`   ❌ Errors:    ${errors}`);

  if (missing.length > 0) {
    console.log('\n⚠️  Articles missing images (no imageOverride set and OG scrape failed):');
    missing.forEach(({ slug, url }) => {
      console.log(`   • ${slug}`);
      if (url) console.log(`     ${url}`);
    });
    console.log('\nTo fix: add imageOverride to the MDX frontmatter, or set a working article URL.');
  }

  console.log('\n🎉 Done! Commit public/images/news/ along with any new MDX files.');
  process.exit(0);
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
  });
}

module.exports = { main, loadNewsItems };
