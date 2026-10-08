#!/usr/bin/env node

/**
 * Pre-commit hook script for stripping metadata from staged files
 *
 * This script:
 * 1. Gets staged files from git
 * 2. Filters for supported file types (images, PDFs, videos)
 * 3. Strips metadata from each file
 * 4. Re-stages the cleaned files
 * 5. Returns exit code 0 on success, 1 on failure
 */

const { execSync } = require('child_process');
const path = require('path');
const { MetadataStripper } = require('../lib/metadata-library.cjs');

async function main() {
  try {
    // Get staged files (Added, Copied, Modified, Renamed)
    const stagedFilesOutput = execSync('git diff --cached --name-only --diff-filter=ACMR', {
      encoding: 'utf-8',
    }).trim();

    if (!stagedFilesOutput) {
      console.log('No staged files to check for metadata.');
      return 0;
    }

    const stagedFiles = stagedFilesOutput.split('\n').filter(Boolean);

    // Create metadata stripper instance
    const stripper = new MetadataStripper({ verbose: false });

    // Filter for supported file types
    const supportedFiles = stagedFiles.filter((file) => stripper.isSupported(file));

    if (supportedFiles.length === 0) {
      console.log('No media files staged that require metadata cleaning.');
      return 0;
    }

    console.log(`\n🔍 Checking ${supportedFiles.length} staged media file(s) for metadata...`);

    let filesWithMetadata = [];
    let cleanedFiles = [];
    let errors = [];

    // First, scan files to see which have metadata
    for (const file of supportedFiles) {
      try {
        const scanResult = await stripper.scanFile(file);
        if (scanResult.hasMetadata) {
          filesWithMetadata.push({ file, concerns: scanResult.concerns });
        }
      } catch (error) {
        // If scan fails, try to clean anyway
        filesWithMetadata.push({ file, concerns: [], scanError: error.message });
      }
    }

    if (filesWithMetadata.length === 0) {
      console.log('✅ All staged media files are already clean of metadata.');
      return 0;
    }

    console.log(`\n⚠️  Found ${filesWithMetadata.length} file(s) with metadata to clean:\n`);

    // Clean each file
    for (const { file, concerns } of filesWithMetadata) {
      const fileName = path.basename(file);
      const fileType = stripper.getFileType(file);

      try {
        console.log(`  🔄 Cleaning: ${fileName} (${fileType})`);

        // Show what metadata was found
        if (concerns.length > 0) {
          const highConcerns = concerns.filter((c) => c.level === 'high');
          const mediumConcerns = concerns.filter((c) => c.level === 'medium');
          const lowConcerns = concerns.filter((c) => c.level === 'low');

          if (highConcerns.length > 0) {
            highConcerns.slice(0, 2).forEach((c) => {
              console.log(`     🔴 ${c.field}: ${c.value}`);
            });
            if (highConcerns.length > 2) {
              console.log(`     ... and ${highConcerns.length - 2} more high concerns`);
            }
          }
          if (mediumConcerns.length > 0 && highConcerns.length < 2) {
            mediumConcerns.slice(0, 2 - highConcerns.length).forEach((c) => {
              console.log(`     🟡 ${c.field}: ${c.value}`);
            });
          }
        }

        // Strip metadata
        await stripper.stripFileMetadata(file);

        // Re-stage the cleaned file
        execSync(`git add "${file}"`, { encoding: 'utf-8' });

        console.log(`     ✅ Cleaned and re-staged`);
        cleanedFiles.push(file);
      } catch (error) {
        console.log(`     ❌ Failed: ${error.message}`);
        errors.push({ file, error: error.message });
      }
    }

    console.log('');

    // Print summary
    if (cleanedFiles.length > 0) {
      console.log(`📊 Metadata cleaning results:`);
      console.log(`   ✅ Successfully cleaned: ${cleanedFiles.length} file(s)`);
      if (errors.length > 0) {
        console.log(`   ❌ Failed: ${errors.length} file(s)`);
      }
      console.log('');
    }

    // If there were errors, fail the commit
    if (errors.length > 0) {
      console.log('❌ Metadata cleaning failed for some files. Commit aborted.');
      console.log('');
      console.log('Failed files:');
      errors.forEach(({ file, error }) => {
        console.log(`   • ${file}: ${error}`);
      });
      console.log('');
      console.log('Please fix these issues and try again.');
      return 1;
    }

    console.log('✅ All media files cleaned successfully. Continuing with commit...\n');
    return 0;
  } catch (error) {
    console.error(`❌ Pre-commit metadata check failed: ${error.message}`);
    return 1;
  }
}

main()
  .then((exitCode) => process.exit(exitCode))
  .catch((error) => {
    console.error(`❌ Unexpected error: ${error.message}`);
    process.exit(1);
  });
