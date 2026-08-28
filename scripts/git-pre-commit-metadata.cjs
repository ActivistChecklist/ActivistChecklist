#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const readline = require('readline')
const { execFileSync } = require('child_process')
const { MetadataStripper } = require('../lib/metadata-library.cjs')

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  bold: '\x1b[1m'
}

function useColor() {
  return Boolean(process.stdout.isTTY || process.stderr.isTTY)
}

function colorize(text, color) {
  if (!useColor()) return text
  return `${color}${text}${COLORS.reset}`
}

function levelColor(level) {
  const normalized = String(level || '').toLowerCase()
  if (normalized === 'high') return COLORS.red
  if (normalized === 'medium') return COLORS.yellow
  if (normalized === 'low') return COLORS.green
  return COLORS.gray
}

function levelIcon(level) {
  const normalized = String(level || '').toLowerCase()
  if (normalized === 'high') return '🔴'
  if (normalized === 'medium') return '🟡'
  if (normalized === 'low') return '🟢'
  return '⚪'
}

function inferRawType(field) {
  const key = String(field || '').toLowerCase()
  if (key.includes('gps') || key.includes('location')) return 'location'
  if (key.includes('author') || key.includes('artist') || key.includes('creator') || key.includes('copyright')) return 'identity'
  if (key.includes('date') || key.includes('time') || key.includes('modify') || key.includes('create')) return 'timestamp'
  if (key.includes('model') || key.includes('make') || key.includes('serial') || key.includes('software')) return 'device'
  return 'other'
}

function rawTypeColor(type) {
  if (type === 'location') return COLORS.red
  if (type === 'identity') return COLORS.magenta
  if (type === 'timestamp') return COLORS.blue
  if (type === 'device') return COLORS.cyan
  return COLORS.gray
}

function summarizeRawEntries(entries) {
  const buckets = new Map()
  entries.forEach((entry) => {
    const type = inferRawType(entry.field)
    if (!buckets.has(type)) {
      buckets.set(type, {
        count: 0,
        fields: []
      })
    }
    const bucket = buckets.get(type)
    bucket.count += 1
    if (bucket.fields.length < 3) {
      bucket.fields.push(entry.field)
    }
  })
  return buckets
}

function rawTypeLabel(type) {
  if (type === 'location') return 'location info'
  if (type === 'identity') return 'identity/author info'
  if (type === 'timestamp') return 'timestamp info'
  if (type === 'device') return 'device/software/profile info'
  return 'other metadata'
}

function runGit(args, options = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...options
  }).trim()
}

function hasControllingTTY() {
  try {
    const fd = fs.openSync('/dev/tty', 'r')
    fs.closeSync(fd)
    return true
  } catch (_) {
    return false
  }
}

function getStagedFiles() {
  const output = runGit(['diff', '--cached', '--name-only', '--diff-filter=ACMR'])
  if (!output) return []
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function promptAction(questionText) {
  return new Promise((resolve) => {
    let input = process.stdin
    let output = process.stdout
    let ttyInput = null
    let ttyOutput = null

    // Git hooks can run with piped stdio; use the controlling terminal when available.
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      try {
        ttyInput = fs.createReadStream('/dev/tty')
        ttyOutput = fs.createWriteStream('/dev/tty')
        input = ttyInput
        output = ttyOutput
      } catch (_) {
        // Fall back to process stdio if /dev/tty is unavailable.
      }
    }

    const rl = readline.createInterface({
      input,
      output
    })

    rl.question(questionText, (answer) => {
      rl.close()
      if (ttyInput) ttyInput.destroy()
      if (ttyOutput) ttyOutput.end()
      const normalized = answer.trim().toLowerCase()
      if (normalized === 'y' || normalized === 'yes') {
        resolve('yes')
        return
      }
      if (normalized === 'show' || normalized === 's') {
        resolve('show')
        return
      }
      resolve('no')
    })
  })
}

function getMetadataEntriesByExiftool(absFile) {
  try {
    const output = execFileSync(
      'exiftool',
      [
        '-json',
        '-q',
        '-q',
        '-n',
        '-EXIF:all',
        '-IPTC:all',
        '-XMP:all',
        '-ICC_Profile:all',
        '-Photoshop:all',
        '-PDF:all',
        '-QuickTime:all',
        '-Keys:all',
        '-UserData:all',
        absFile
      ],
      {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      }
    ).trim()

    if (!output) return false
    const parsed = JSON.parse(output)
    if (!Array.isArray(parsed) || parsed.length === 0) return false

    const metadata = parsed[0] || {}
    const keys = Object.keys(metadata).filter((key) => key !== 'SourceFile')

    return keys.map((key) => {
      const value = metadata[key]
      if (Array.isArray(value)) {
        return { field: key, value: value.join(', ') }
      }
      if (value === null || value === undefined) {
        return { field: key, value: '(empty)' }
      }
      return { field: key, value: String(value) }
    })
  } catch (error) {
    throw new Error(`exiftool scan failed: ${error.message}`)
  }
}

async function printDryRunReport(stripper, filesWithMetadata, repoRoot) {
  console.log('')
  console.log(colorize('metadata hook: dry run metadata report', COLORS.bold))
  console.log(colorize('metadata hook: no files were modified', COLORS.gray))

  for (const file of filesWithMetadata) {
    console.log('')
    console.log(`- ${colorize(file.relativeFile, COLORS.bold)}`)
    try {
      const scanResult = await stripper.scan(file.absFile)
      const firstFile = scanResult.files && scanResult.files[0] ? scanResult.files[0] : null
      if (!firstFile || !firstFile.concerns || firstFile.concerns.length === 0) {
        if (file.exiftoolEntries && file.exiftoolEntries.length > 0) {
          console.log(`  ${colorize('metadata detected (raw exiftool fields):', COLORS.gray)}`)
          const buckets = summarizeRawEntries(file.exiftoolEntries)
          for (const [type, bucket] of buckets.entries()) {
            const label = rawTypeLabel(type)
            const examples = bucket.fields.join(', ')
            console.log(`  - ${label} (${bucket.count} field${bucket.count === 1 ? '' : 's'})`)
            console.log(`    examples: ${examples}`)
          }
        } else {
          console.log(`  ${colorize('metadata detected, but no detailed fields were returned', COLORS.gray)}`)
        }
        continue
      }

      firstFile.concerns.forEach((concern) => {
        const level = concern.level || 'unknown'
        const field = concern.field || concern.type || 'metadata'
        const value = concern.value || concern.description || '(value unavailable)'
        const icon = levelIcon(level)
        const baseLine = `  ${icon} [${String(level).toUpperCase()}] ${field}: ${value}`
        const normalized = String(level).toLowerCase()
        if (normalized === 'high' || normalized === 'medium') {
          console.log(colorize(baseLine, levelColor(level)))
        } else {
          const levelLabel = colorize(level, levelColor(level))
          const fieldLabel = colorize(field, COLORS.bold)
          console.log(`  ${icon} [${levelLabel}] ${fieldLabel}: ${value}`)
        }
      })
    } catch (error) {
      const relativePath = path.relative(repoRoot, file.absFile)
      console.log(`  failed to generate dry run details for ${relativePath}: ${error.message}`)
    }
  }
}

async function main() {
  let repoRoot
  try {
    repoRoot = runGit(['rev-parse', '--show-toplevel'])
  } catch (error) {
    console.error('metadata hook: failed to detect git repo root')
    process.exit(1)
  }

  const stagedRelativeFiles = getStagedFiles()
  if (stagedRelativeFiles.length === 0) {
    process.exit(0)
  }

  const stripper = new MetadataStripper({
    verbose: false,
    backup: false
  })

  const stagedAbsSupportedFiles = stagedRelativeFiles
    .map((relativeFile) => ({
      relativeFile,
      absFile: path.resolve(repoRoot, relativeFile)
    }))
    .filter(({ absFile }) => fs.existsSync(absFile))
    .filter(({ absFile }) => stripper.isSupported(absFile))

  if (stagedAbsSupportedFiles.length === 0) {
    process.exit(0)
  }

  const filesWithMetadata = []

  for (const file of stagedAbsSupportedFiles) {
    try {
      const exiftoolEntries = getMetadataEntriesByExiftool(file.absFile)
      if (exiftoolEntries.length > 0) {
        filesWithMetadata.push({
          ...file,
          exiftoolEntries
        })
      }
    } catch (error) {
      console.error(`metadata hook: scan failed for ${file.relativeFile}`)
      console.error(`  ${error.message}`)
      process.exit(1)
    }
  }

  if (filesWithMetadata.length === 0) {
    process.exit(0)
  }

  const listText = filesWithMetadata
    .map((file) => `  - ${file.relativeFile}`)
    .join('\n')

  const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY) || hasControllingTTY()
  if (!isInteractive) {
    console.error(colorize('metadata hook: metadata concerns found in staged files:', COLORS.yellow))
    console.error(listText)
    console.error(colorize('metadata hook: commit aborted in non-interactive mode.', COLORS.red))
    console.error(colorize('metadata hook: run commit from a terminal to approve in-place scrubbing.', COLORS.gray))
    process.exit(1)
  }

  console.log(colorize('metadata hook: metadata concerns found in staged files:', COLORS.yellow))
  console.log(listText)
  const action = await promptAction('Scrub metadata in-place and continue commit? (yes/no/show): ')

  if (action === 'show') {
    await printDryRunReport(stripper, filesWithMetadata, repoRoot)
    console.error(colorize('metadata hook: commit aborted after dry run.', COLORS.yellow))
    process.exit(1)
  }

  if (action !== 'yes') {
    console.error(colorize('metadata hook: commit aborted by user.', COLORS.red))
    process.exit(1)
  }

  const absFiles = filesWithMetadata.map((file) => file.absFile)
  const stripResults = await stripper.stripSelectedFiles({ files: [] }, absFiles)

  if (stripResults.errors > 0) {
    console.error(colorize('metadata hook: one or more files failed to scrub.', COLORS.red))
    stripResults.files
      .filter((result) => !result.success)
      .forEach((result) => {
        const relativePath = path.relative(repoRoot, result.filePath)
        console.error(`  - ${relativePath}: ${result.error}`)
      })
    process.exit(1)
  }

  for (const file of filesWithMetadata) {
    try {
      runGit(['add', '--', file.relativeFile])
    } catch (error) {
      console.error(`metadata hook: failed to re-stage ${file.relativeFile}`)
      process.exit(1)
    }
  }

  console.log(`metadata hook: scrubbed and re-staged ${filesWithMetadata.length} file(s).`)
}

main().catch((error) => {
  console.error('metadata hook: unexpected failure')
  console.error(error.message)
  process.exit(1)
})
