import { NextRequest, NextResponse } from 'next/server';
import { getChecklistItem, serializeFrontmatter } from '@/lib/content';
import { serializeMdx } from '@/lib/serialize-mdx';
import { DEFAULT_LOCALE } from '@/lib/i18n-config';

export const dynamic = 'force-dynamic';

/**
 * JSON for Keystatic MDX editor: full checklist item (serialized body + frontmatter)
 * so the guide editor can preview the same rendering as the public site.
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug');
  if (!slug) {
    return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
  }

  const item = getChecklistItem(slug, DEFAULT_LOCALE);
  if (!item) {
    return NextResponse.json({ error: 'Checklist item not found' }, { status: 404 });
  }

  try {
    const serializedBody = await serializeMdx(item.content);
    return NextResponse.json({
      frontmatter: serializeFrontmatter(item.frontmatter),
      serializedBody,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
