#!/usr/bin/env node

/**
 * Interactive wizard (with optional CLI args) to add a news MDX item and fetch its image.
 *
 * Usage:
 *   yarn news
 *   yarn news "https://example.com/article"
 *   yarn news "https://..." --source="The Intercept"   # optional; otherwise inferred from page metadata
 *   yarn news "https://..." --tags="ice, surveillance"
 *
 * First positional argument is the article URL (no flag). Other options use --key=value.
 *
 * After a successful push, if GitHub CLI (`gh`) is installed and authenticated, you can open a
 * pull request into main and enable auto-merge. The wizard prints a highlighted reminder of which
 * GitHub account will create the PR before you confirm.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { execFileSync } = require('child_process');
const matter = require('gray-matter');
const ogs = require('open-graph-scraper');
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

const { loadNewsItems } = require('./fetch-news-images.js');

function printGhIdentityBanner(auth) {
  const login = auth.login || '(unknown login)';
  const bannerLabel =
    typeof chalk?.bgCyan?.black?.bold === 'function' ? chalk.bgCyan.black.bold('  gh  ') : '  gh  ';
  const bannerText = typeof chalk?.bold === 'function' ? chalk.bold('  Pull requests will be created as:') : '  Pull requests will be created as:';
  const spacer = typeof chalk?.bold === 'function' ? chalk.bold('      ') : '      ';
  const loginStyled = typeof chalk?.green?.bold === 'function' ? chalk.green.bold(login) : login;
  const nameStyled =
    auth.name && typeof chalk?.gray === 'function' ? chalk.gray(`  (${auth.name})`) : auth.name ? `  (${auth.name})` : '';
  const profilePrefix = typeof chalk?.gray === 'function' ? chalk.gray('      ') : '      ';
  const profileStyled =
    typeof chalk?.cyan?.underline === 'function' ? chalk.cyan.underline(auth.profileUrl || '') : auth.profileUrl || '';
  console.log('');
  console.log(bannerLabel + bannerText);
  console.log(spacer + loginStyled + nameStyled);
  if (auth.profileUrl) {
    console.log(profilePrefix + profileStyled);
  }
  console.log('');
}

function parseArgv(argv) {
  const positional = [];
  const flags = {};
  for (const a of argv) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        flags[a.slice(2)] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function promptLine(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer));
  });
}

function normalizeHost(hostname) {
  return String(hostname || '')
    .replace(/^www\./i, '')
    .toLowerCase();
}

function slugify(text) {
  const s = String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
  return (s || 'news-item').slice(0, 120);
}

function uniqueSlug(base) {
  const existing = new Set(loadNewsItems().map((i) => i.slug));
  let s = base;
  let n = 2;
  while (existing.has(s)) {
    s = `${base}-${n}`;
    n++;
  }
  return s;
}

/**
 * Publication label stored verbatim in news MDX frontmatter (`source:`).
 */
function pickSourceDisplayName(articleUrl, siteNameHint, explicit) {
  if (explicit) {
    return String(explicit).trim();
  }

  let articleHost;
  try {
    articleHost = normalizeHost(new URL(articleUrl).hostname);
  } catch {
    throw new Error('Invalid article URL.');
  }

  return (siteNameHint && siteNameHint.trim()) || articleHost;
}

function parsePublishedDate(result) {
  const published =
    result.articlePublishedTime ||
    result.ogArticlePublishedTime ||
    result.articlePublishedDate ||
    result.publishedTime ||
    result.ogDate ||
    null;
  const modified =
    result.articleModifiedTime ||
    result.ogArticleModifiedTime ||
    result.articleModifiedDate ||
    result.modifiedTime ||
    null;
  const raw = published || modified || null;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

function todayIsoLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function pickTitle(result) {
  return (
    (result.ogTitle && String(result.ogTitle).trim()) ||
    (result.twitterTitle && String(result.twitterTitle).trim()) ||
    (result.htmlTitle && String(result.htmlTitle).trim()) ||
    null
  );
}

function titleFromUrlPath(articleUrl) {
  try {
    const pathname = new URL(articleUrl).pathname || '';
    const part = pathname
      .split('/')
      .filter(Boolean)
      .pop();
    if (!part) return null;
    const cleaned = decodeURIComponent(part)
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return null;
    return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return null;
  }
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseHtmlMetadata(html) {
  const out = {};
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]) {
    out.htmlTitle = decodeHtmlEntities(titleMatch[1].trim());
  }

  const metaRegex = /<meta\s+[^>]*>/gi;
  const attrRegex = /([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  const tags = html.match(metaRegex) || [];
  for (const tag of tags) {
    const attrs = {};
    let m;
    while ((m = attrRegex.exec(tag)) !== null) {
      const key = String(m[1] || '').toLowerCase();
      const value = m[2] || m[3] || m[4] || '';
      attrs[key] = decodeHtmlEntities(value.trim());
    }
    const prop = attrs.property || attrs.name;
    if (!prop) continue;
    const lcProp = prop.toLowerCase();
    const content = attrs.content || '';
    if (!content) continue;

    if (lcProp === 'og:title' && !out.ogTitle) out.ogTitle = content;
    if (lcProp === 'twitter:title' && !out.twitterTitle) out.twitterTitle = content;
    if (lcProp === 'og:site_name' && !out.ogSiteName) out.ogSiteName = content;
    if (lcProp === 'article:publisher' && !out.articlePublisher) out.articlePublisher = content;
    if (lcProp === 'article:published_time' && !out.articlePublishedTime) out.articlePublishedTime = content;
    if (lcProp === 'article:modified_time' && !out.articleModifiedTime) out.articleModifiedTime = content;
  }
  return out;
}

async function fetchHtmlMetadata(url) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      DNT: '1',
    },
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const html = await response.text();
  return parseHtmlMetadata(html);
}

async function fetchOg(url) {
  try {
    const { error, result } = await ogs({
      url,
      timeout: 15000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        DNT: '1',
      },
    });
    if (error) {
      throw new Error(`Open Graph fetch failed: ${String(error)}`);
    }
    return result;
  } catch (err) {
    const ogDetail =
      err?.message ||
      err?.error ||
      err?.details ||
      (typeof err === 'object' ? JSON.stringify(err) : String(err));
    try {
      return await fetchHtmlMetadata(url);
    } catch (fallbackErr) {
      const fallbackDetail =
        fallbackErr?.message ||
        fallbackErr?.error ||
        (typeof fallbackErr === 'object' ? JSON.stringify(fallbackErr) : String(fallbackErr));
      throw new Error(`Open Graph fetch failed: ${ogDetail}. Fallback metadata fetch failed: ${fallbackDetail}`);
    }
  }
}

function formatTagsForFrontmatter(tags) {
  if (!tags.length) return null;
  return tags.join(', ');
}

/** Map lowercase tag -> preferred spelling as it first appears in existing news MDX. */
function collectKnownTagCanonical() {
  const canonical = new Map();
  for (const { frontmatter } of loadNewsItems()) {
    const raw = frontmatter.tags;
    if (!raw || typeof raw !== 'string') continue;
    for (const part of raw.split(',')) {
      const t = part.trim();
      if (!t) continue;
      const lc = t.toLowerCase();
      if (!canonical.has(lc)) canonical.set(lc, t);
    }
  }
  return canonical;
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const row = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return row[n];
}

function maxTypoDistanceForLength(len) {
  if (len <= 4) return 1;
  if (len <= 10) return 2;
  return 2;
}

/**
 * If `lc` is not known, return a single best existing tag spelling that looks like a typo, else null.
 */
function findTypoSuggestion(lc, canonical) {
  if (lc.length <= 2) return null;
  const maxD = maxTypoDistanceForLength(lc.length);
  const scored = [];
  for (const [knownLc, display] of canonical) {
    if (knownLc === lc) continue;
    const d = levenshtein(lc, knownLc);
    if (d <= maxD) scored.push({ d, display, knownLc });
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => a.d - b.d || a.knownLc.localeCompare(b.knownLc));
  const best = scored[0];
  if (scored.length > 1 && scored[1].d === best.d) return null;
  return best.display;
}

/** Dedupe tags case-insensitively, preserve first occurrence order. */
function dedupeTagsCaseInsensitive(tags) {
  const seen = new Set();
  const out = [];
  for (const t of tags) {
    const lc = t.toLowerCase();
    if (seen.has(lc)) continue;
    seen.add(lc);
    out.push(t);
  }
  return out;
}

async function resolveTagsWithTypoHints(rawTags, getRl) {
  const canonical = collectKnownTagCanonical();
  const resolved = [];

  for (const raw of rawTags) {
    const tag = raw.trim();
    if (!tag) continue;
    const lc = tag.toLowerCase();

    if (canonical.has(lc)) {
      resolved.push(canonical.get(lc));
      continue;
    }

    const suggestion = findTypoSuggestion(lc, canonical);
    if (suggestion) {
      const line = await promptLine(
        getRl(),
        `Did you mean "${suggestion}" instead of "${tag}"? [Y/n]: `
      );
      const a = String(line || '')
        .trim()
        .toLowerCase();
      if (a === '' || a === 'y' || a === 'yes') {
        resolved.push(suggestion);
      } else {
        resolved.push(tag);
      }
    } else {
      resolved.push(tag);
    }
  }

  return dedupeTagsCaseInsensitive(resolved);
}

const GIT_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GIT_SSH_COMMAND: 'ssh -o ConnectTimeout=15 -o ServerAliveInterval=5 -o ServerAliveCountMax=2',
};

function git(args, options = {}) {
  const cmd = `git ${args.join(' ')}`;
  console.error(`[git] ${cmd}`);
  try {
    const output = execFileSync('git', args, {
      encoding: 'utf8',
      cwd: path.join(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'inherit'],
      env: GIT_ENV,
      ...options,
    });
    if (typeof output === 'string') return output.trim();
    return '';
  } catch (err) {
    const stderr = err.stderr ? err.stderr.trim() : '';
    const detail = stderr || err.message || String(err);
    throw new Error(`git command failed: ${cmd}\n  ${detail}`);
  }
}

function tryGit(args, options = {}) {
  try {
    return { ok: true, value: git(args, options) };
  } catch (error) {
    return { ok: false, error };
  }
}

const REPO_ROOT = path.join(__dirname, '..');

function tryGh(args, options = {}) {
  try {
    const output = execFileSync('gh', args, {
      encoding: 'utf8',
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });
    return { ok: true, output: typeof output === 'string' ? output.trim() : '' };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * Returns { ok, login?, name?, profileUrl? } — ok is true only when gh is installed and authenticated.
 */
function getGhSessionInfo() {
  const st = tryGh(['auth', 'status']);
  if (!st.ok) {
    return { ok: false, reason: 'not_logged_in' };
  }
  const raw = tryGh(['api', 'user']);
  if (!raw.ok) {
    return { ok: false, reason: 'user_api_failed' };
  }
  try {
    const u = JSON.parse(raw.output || '{}');
    return {
      ok: true,
      login: u.login || null,
      name: u.name || null,
      profileUrl: u.html_url || null,
    };
  } catch {
    return { ok: false, reason: 'parse_failed' };
  }
}

function parsePrUrlFromCreateOutput(text) {
  const m = String(text || '').match(/https:\/\/github\.com\/[^\s/]+\/[^\s/]+\/pull\/\d+/);
  return m ? m[0] : null;
}

/**
 * After a content branch is pushed, optionally create a PR and enable auto-merge.
 */
async function maybeCreatePullRequest(getRl, { branchName, articleTitle, articleUrl }) {
  const ghInstalled = tryGh(['--version']);
  if (!ghInstalled.ok) {
    console.log('\n💡 Install GitHub CLI (`gh`) and run `gh auth login` to open a pull request from this wizard.');
    return;
  }

  const auth = getGhSessionInfo();
  if (!auth.ok) {
    console.log(
      '\n💡 GitHub CLI is not logged in. Run `gh auth login`, then re-run or open a PR manually from the pushed branch.'
    );
    return;
  }

  printGhIdentityBanner(auth);
  const line = await promptLine(
    getRl(),
    'Create a pull request into main and enable auto-merge when checks pass? [Y/n]: '
  );
  const answer = String(line || '').trim();
  const yes = answer === '' || /^y(es)?$/i.test(answer);
  if (!yes) {
    console.log('Skipped PR creation.');
    return;
  }

  const prTitle = `Adding news: ${articleTitle}`;
  const prBody = `Add news item.\n\nArticle: ${articleUrl}\n`;
  const create = tryGh(
    [
      'pr',
      'create',
      '--base',
      'main',
      '--head',
      branchName,
      '--title',
      prTitle,
      '--body',
      prBody,
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] }
  );
  if (!create.ok) {
    console.error('\n❌ gh pr create failed. Open a PR manually from branch:', branchName);
    return;
  }

  let prUrl = parsePrUrlFromCreateOutput(create.output);
  if (!prUrl) {
    const headRef = auth.login ? `${auth.login}:${branchName}` : branchName;
    const listed = tryGh(['pr', 'list', '--head', headRef, '--json', 'url']);
    if (listed.ok) {
      try {
        const rows = JSON.parse(listed.output || '[]');
        if (rows[0]?.url) prUrl = rows[0].url;
      } catch {
        // ignore
      }
    }
  }
  if (!prUrl) {
    console.log('\n✅ Pull request created. Enable auto-merge in the GitHub UI if you want it.');
    return;
  }

  console.log(`\n✅ Created: ${prUrl}`);
  const merge = tryGh(
    ['pr', 'merge', prUrl, '--auto', '--squash', '--subject', prTitle],
    { stdio: 'inherit' }
  );
  if (!merge.ok) {
    console.warn(
      '\n⚠️  Could not enable auto-merge (repo settings or permissions). You can enable it on the PR in GitHub.'
    );
  } else {
    console.log('Auto-merge enabled (squash); the PR will merge when required checks pass.');
  }
}

function buildContentBranchName(slug) {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  const base = `content/${date}-news-${slug}`.slice(0, 120);
  let candidate = base;
  let n = 2;
  while (tryGit(['ls-remote', '--exit-code', '--heads', 'origin', `refs/heads/${candidate}`]).ok) {
    const suffix = `-${n}`;
    candidate = `${base.slice(0, 120 - suffix.length)}${suffix}`;
    n += 1;
  }
  return candidate;
}

function transactionalCommitToContentBranch({ slug, mdxBody, articleTitle }) {
  const repoRoot = path.join(__dirname, '..');
  const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'news-wizard-main-'));
  const branchName = buildContentBranchName(slug);
  let worktreeAdded = false;

  try {
    // Build commit in isolated worktree rooted at latest origin/main.
    git(['fetch', 'origin', 'main'], { stdio: 'inherit' });
    git(['worktree', 'add', '--detach', worktreeDir, 'origin/main'], { stdio: 'inherit' });
    worktreeAdded = true;

    // Ensure commit hooks run with the same dependencies as the main repo.
    // Many hooks run "yarn test" and expect local node_modules to exist.
    const repoNodeModules = path.join(repoRoot, 'node_modules');
    const wtNodeModules = path.join(worktreeDir, 'node_modules');
    if (fs.existsSync(repoNodeModules) && !fs.existsSync(wtNodeModules)) {
      fs.symlinkSync(repoNodeModules, wtNodeModules, 'junction');
    }

    // Generate content directly inside isolated worktree.
    const mdxRel = path.join('content', 'en', 'news', `${slug}.mdx`);
    const imageRel = path.join('public', 'images', 'news', `${slug}.jpg`);
    const mdxAbs = path.join(worktreeDir, mdxRel);
    fs.mkdirSync(path.dirname(mdxAbs), { recursive: true });
    fs.writeFileSync(mdxAbs, mdxBody, 'utf8');
    console.log(`Created in worktree: ${mdxRel}`);

    console.log('Running fetch-news for this slug in worktree…');
    execFileSync(process.execPath, [path.join(worktreeDir, 'scripts', 'fetch-news-images.js'), `--slug=${slug}`, '--quiet'], {
      stdio: 'inherit',
      cwd: worktreeDir,
    });

    const imageExists = fs.existsSync(path.join(worktreeDir, imageRel));
    if (!imageExists) {
      console.warn(
        '\n⚠️  WARNING: No image was saved in worktree. Commit will include MDX only.\n' +
          `   Expected: ${imageRel}\n`
      );
    } else {
      console.log(`Image OK in worktree: ${imageRel}\n`);
    }

    const filesToCommit = imageExists ? [mdxRel, imageRel] : [mdxRel];

    git(['-C', worktreeDir, 'add', ...filesToCommit], { stdio: 'inherit' });
    const repoBin = path.join(repoNodeModules, '.bin');
    const commitEnv = {
      ...GIT_ENV,
      NODE_PATH: process.env.NODE_PATH
        ? `${repoNodeModules}${path.delimiter}${process.env.NODE_PATH}`
        : repoNodeModules,
      PATH: process.env.PATH
        ? `${repoBin}${path.delimiter}${process.env.PATH}`
        : repoBin,
    };
    git(['-C', worktreeDir, 'commit', '-m', articleTitle], {
      stdio: 'inherit',
      env: commitEnv,
    });
    console.log(`Pushing branch: ${branchName}`);
    git(['-C', worktreeDir, 'push', '-u', 'origin', `HEAD:refs/heads/${branchName}`], { stdio: 'inherit' });
    return branchName;
  } catch (error) {
    throw error;
  } finally {
    if (worktreeAdded) {
      tryGit(['worktree', 'remove', '--force', worktreeDir], { stdio: 'inherit' });
    } else {
      try {
        if (fs.existsSync(worktreeDir)) fs.rmdirSync(worktreeDir);
      } catch {
        // ignore
      }
    }
  }
}

/**
 * gray-matter uses js-yaml, which quotes `YYYY-MM-DD` *strings* so they stay
 * strings. Elsewhere in this repo we use unquoted YAML date scalars
 * (`date: 2025-12-22`). Both parse the same; unquoted matches existing files.
 */
function normalizeWizardYamlDates(yamlDocument) {
  return yamlDocument.replace(
    /^(\s*(?:date|firstPublished|lastUpdated):\s*)'(\d{4}-\d{2}-\d{2})'$/gm,
    '$1$2'
  );
}

async function main() {
  const { positional, flags } = parseArgv(process.argv.slice(2));

  let articleUrl = positional[0] || flags.url;
  const explicitSource = flags.source || null;
  const flagTitle = flags.title ? String(flags.title) : null;
  const flagDate = flags.date ? String(flags.date) : null;
  const tagsFromCli = flags.tags !== undefined;
  const flagTags = tagsFromCli ? String(flags.tags) : null;

  let rl;
  function getRl() {
    if (!rl) {
      rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    }
    return rl;
  }

  try {
    if (!articleUrl) {
      articleUrl = (await promptLine(getRl(), 'Article URL: ')).trim();
    }
    if (!articleUrl) {
      throw new Error('URL is required.');
    }
    let parsedUrl;
    try {
      parsedUrl = new URL(articleUrl);
    } catch {
      throw new Error('Invalid URL.');
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('URL must be http or https.');
    }

    const og = await fetchOg(articleUrl);

    const title = flagTitle || pickTitle(og) || titleFromUrlPath(articleUrl);
    if (!title) {
      throw new Error('Could not determine title (no og:title). Pass --title="…" to set it manually.');
    }

    let published = flagDate || parsePublishedDate(og);
    if (!published) {
      published = todayIsoLocal();
      console.warn('⚠️  Could not determine published date from metadata. Using today; pass --date=YYYY-MM-DD to override.');
    }

    const ogSiteName = og.ogSiteName ? String(og.ogSiteName).trim() : '';
    const publisherHint = [
      ogSiteName,
      og.ogArticlePublisher && String(og.ogArticlePublisher).trim(),
      og.articlePublisher && String(og.articlePublisher).trim(),
    ].find(Boolean) || '';
    const sourceField = pickSourceDisplayName(articleUrl, publisherHint, explicitSource);

    const baseSlug = slugify(title);
    const slug = uniqueSlug(baseSlug);
    const today = todayIsoLocal();

    console.log('\n--- Review (edit the MDX file afterward if anything looks wrong) ---');
    console.log(`URL:              ${articleUrl}`);
    console.log(`Title:            ${title}`);
    console.log(`Source:           ${JSON.stringify(sourceField)}`);
    if (publisherHint) {
      console.log(`Site / publisher: ${publisherHint}`);
    }
    console.log(`Date published:   ${published}`);
    console.log(`Site add dates:   firstPublished / lastUpdated → ${today}`);
    console.log(`File:             content/en/news/${slug}.mdx`);
    console.log(`Image (planned):  public/images/news/${slug}.jpg`);
    console.log('------------------------------------------------------------------\n');

    let tagsLine = flagTags;
    if (tagsLine === null) {
      tagsLine = await promptLine(getRl(), 'Tags (comma-separated, Enter for none): ');
    }

    const rawTags = tagsLine
      ? tagsLine
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    const tags = await resolveTagsWithTypoHints(rawTags, getRl);

    const frontmatter = {
      title,
      date: published,
      url: articleUrl,
      source: sourceField,
      firstPublished: today,
      lastUpdated: today,
    };
    // Filename is the canonical slug; do not add a `slug` frontmatter field.
    delete frontmatter.slug;
    const tagArr = formatTagsForFrontmatter(tags);
    if (tagArr) {
      frontmatter.tags = tagArr;
    }

    const mdxBody = normalizeWizardYamlDates(matter.stringify('\n', frontmatter));

    console.log('\nRunning git automation (transactional push to content branch)…');
    const pushedBranch = transactionalCommitToContentBranch({
      slug,
      mdxBody,
      articleTitle: title,
    });

    console.log(`✅ Done. Committed and pushed to ${pushedBranch}.`);

    await maybeCreatePullRequest(getRl, {
      branchName: pushedBranch,
      articleTitle: title,
      articleUrl,
    });
  } finally {
    if (rl) rl.close();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`\n❌ ${err.message || err}`);
    process.exit(1);
  });
}
