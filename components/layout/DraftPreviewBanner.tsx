// @ts-nocheck — ui/button.jsx has loose typings for variant/size/children
import { cookies, draftMode } from 'next/headers';
import {
  Check,
  CircleHelp,
  ExternalLink,
  FilePlus,
  FileText,
  GitBranch,
  GitCompare,
  Hand,
} from 'lucide-react';
import { FaGithub } from 'react-icons/fa6';

import Link from '@/components/Link';
import { Button } from '@/components/ui/button';
import { getGuide, getPage } from '@/lib/content';
import { getPreviewVsDefaultFileStatus } from '@/lib/github-preview-diff-status.mjs';
import { keystaticItemEditPath } from '@/lib/keystatic-admin-url';
import { githubBlobUrl } from '@/lib/github-web-url';
import { getCanonicalGithubRepo, getGithubRepoForContentFetch } from '@/lib/preview-github-repo';

type Props = {
  locale: string;
  /** URL slug path (e.g. doxxing or nested/segment). */
  slug: string;
};

/**
 * Same order as SlugPage: guide MDX first, then page. Matches disk so the GitHub link
 * points at the real file; if the slug is new (not on disk yet), we guess `guides/` first.
 */
function relativeMdxPathForSlug(slug, locale) {
  if (!slug) return null;
  if (getGuide(slug, locale)) return `guides/${slug}.mdx`;
  if (getPage(slug, locale)) return `pages/${slug}.mdx`;
  return `guides/${slug}.mdx`;
}

/** `guides/foo.mdx` → { collectionKey: 'guides', itemSlug: 'foo' } — matches keystatic.config collection keys. */
function keystaticPartsFromRelativePath(relativePath) {
  const m = relativePath.match(/^([^/]+)\/(.+)\.mdx$/);
  if (!m) return null;
  return { collectionKey: m[1], itemSlug: m[2] };
}

const btnClass =
  'h-8 gap-1.5 border-amber-700/50 bg-background/90 px-3 text-xs hover:bg-background dark:border-amber-500/40';

const DIFF_BADGE = {
  changed: {
    Icon: GitCompare,
    label: 'This file has been modified on the current branch',
    className:
      'border border-amber-600/35 bg-amber-200/90 text-amber-950 dark:border-amber-500/30 dark:bg-amber-900/45 dark:text-amber-50',
  },
  unchanged: {
    Icon: Check,
    label: 'No modifications to this file on this branch',
    className:
      'border border-emerald-600/25 bg-emerald-100/95 text-emerald-950 dark:border-emerald-500/25 dark:bg-emerald-950/35 dark:text-emerald-50',
  },
  new: {
    Icon: FilePlus,
    label: 'New file on this branch (not on default)',
    className:
      'border border-sky-600/25 bg-sky-100/95 text-sky-950 dark:border-sky-500/25 dark:bg-sky-950/35 dark:text-sky-50',
  },
  unknown: {
    Icon: CircleHelp,
    label: 'Could not compare to default (API, rate limit, or missing file)',
    className: 'border border-border bg-muted/80 text-muted-foreground dark:bg-muted/50',
  },
};

/**
 * Shown when viewing the site in Keystatic draft preview mode (/preview/start).
 */
export default async function DraftPreviewBanner({ locale, slug }: Props) {
  let enabled = false;
  try {
    enabled = (await draftMode()).isEnabled;
  } catch {
    return null;
  }
  if (!enabled) {
    return null;
  }

  const branch = (await cookies()).get('ks-branch')?.value;
  const previewRepo = await getGithubRepoForContentFetch();
  const canonicalRepo = getCanonicalGithubRepo();
  const isForkPreview =
    previewRepo.owner !== canonicalRepo.owner || previewRepo.name !== canonicalRepo.name;
  const repoLabel = `${previewRepo.owner}/${previewRepo.name}`;

  const relativePath = relativeMdxPathForSlug(slug, locale);
  const contentPath = relativePath != null ? `content/${locale}/${relativePath}` : null;
  const githubUrl =
    branch && relativePath ? githubBlobUrl(branch, locale, relativePath, previewRepo) : null;
  const ksParts = relativePath ? keystaticPartsFromRelativePath(relativePath) : null;
  const keystaticUrl =
    branch && ksParts
      ? keystaticItemEditPath(branch, ksParts.collectionKey, ksParts.itemSlug)
      : null;

  const breadcrumbTitle = branch && contentPath ? `${branch} › ${contentPath}` : null;

  let diffStatus = 'unknown';
  if (branch && relativePath) {
    try {
      diffStatus = await getPreviewVsDefaultFileStatus(branch, locale, relativePath);
    } catch {
      diffStatus = 'unknown';
    }
  }
  const badge = DIFF_BADGE[diffStatus] ?? DIFF_BADGE.unknown;
  const BadgeIcon = badge.Icon;

  return (
    <div className="border-b border-amber-500/35 bg-amber-500/12 dark:bg-amber-950/25">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
            <span className="text-sm font-semibold tracking-tight text-amber-950 dark:text-amber-50">
              Draft preview
            </span>
            <span
              className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border border-amber-700/25 bg-amber-100/40 px-2 py-0.5 font-mono text-[11px] text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/35 dark:text-amber-100/90"
              title={`Preview content from GitHub: ${repoLabel}`}
            >
              <FaGithub className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
              <span className="min-w-0 truncate">{repoLabel}</span>
              {isForkPreview ? (
                <span className="shrink-0 rounded bg-amber-800/15 px-1 py-px text-[10px] font-sans font-medium uppercase tracking-wide text-amber-900 dark:bg-amber-400/15 dark:text-amber-100">
                  fork
                </span>
              ) : null}
            </span>
            {breadcrumbTitle ? (
              <span
                className="inline-flex max-w-full min-w-0 items-center gap-1 font-mono text-[11px] text-amber-900 dark:text-amber-100/85"
                title={breadcrumbTitle}
              >
                <GitBranch
                  className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-300/90"
                  aria-hidden
                />
                <span className="shrink-0">{branch}</span>
                <span className="select-none text-amber-600/70 dark:text-amber-400/55" aria-hidden>
                  ›
                </span>
                <FileText
                  className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-300/90"
                  aria-hidden
                />
                <span className="min-w-0 truncate">{contentPath}</span>
              </span>
            ) : null}
            <span
              className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-snug sm:max-w-[min(100%,26rem)] ${badge.className}`}
              title={badge.label}
            >
              <BadgeIcon className="h-3 w-3 shrink-0" aria-hidden />
              <span className="sr-only">{badge.label}</span>
              <span aria-hidden className="min-w-0">
                {diffStatus === 'changed' && 'This file has been edited on the current branch'}
                {diffStatus === 'unchanged' && 'No changes on this branch'}
                {diffStatus === 'new' && 'New on this branch vs default'}
                {diffStatus === 'unknown' && 'Compare unavailable'}
              </span>
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-start gap-2 sm:justify-end">
          {githubUrl && relativePath ? (
            <Button asChild variant="outline" size="sm" className={btnClass}>
              <a
                href={githubUrl}
                target="_blank"
                rel="noreferrer"
                title={`Open ${contentPath} on ${repoLabel}@${branch}`}
              >
                <FaGithub className="h-3.5 w-3.5 shrink-0" aria-hidden />
                GitHub
              </a>
            </Button>
          ) : null}
          {keystaticUrl ? (
            <Button asChild variant="outline" size="sm" className={btnClass}>
              <Link href={keystaticUrl} title="Open this entry in Keystatic">
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Keystatic
              </Link>
            </Button>
          ) : null}
          <form method="POST" action="/preview/end" className="inline-flex">
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className={btnClass}
              title="Leave draft preview"
            >
              <Hand className="h-3.5 w-3.5 shrink-0" aria-hidden />
              End preview
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
