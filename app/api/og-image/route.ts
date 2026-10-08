export const dynamic = 'force-static';

import { NextRequest, NextResponse } from 'next/server';

// Pages that should use the default OG image
const USE_DEFAULT_OG_IMAGE = [
  'home',
  '',
  'privacy',
  'contact',
  'resources',
  'about',
  'checklists',
  'flyer',
];

export async function GET(request: NextRequest) {
  // Only available in development
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { searchParams } = request.nextUrl;
  const title = searchParams.get('title') || 'Activist Checklist';
  const type = searchParams.get('type') || 'page';
  const slug = searchParams.get('slug') || '';

  // Redirect to default OG image for certain pages
  if (USE_DEFAULT_OG_IMAGE.includes(slug)) {
    return NextResponse.redirect(new URL('/images/og-image.png', request.url));
  }

  try {
    const { generateOgImageBuffer } = await import('@/lib/og-image');
    const buffer = await generateOgImageBuffer(title, type, slug);
    if (!buffer) {
      return NextResponse.json({ error: 'Failed to generate image' }, { status: 500 });
    }

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('OG image generation error:', error);
    const message = (error as Error).message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
