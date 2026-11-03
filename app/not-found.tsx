// @ts-nocheck
import '@/styles/globals.css';
import NotFoundContent from '@/components/pages/NotFoundContent';
import { withNavCopy } from '@/lib/nav-copy';

export default async function NotFound() {
  const messages = withNavCopy((await import('@/messages/en.json')).default, 'en');

  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-body antialiased">
        <NotFoundContent messages={messages} />
      </body>
    </html>
  );
}
