/**
 * Replaces app/keystatic/layout.tsx when BUILD_MODE=static.
 * Avoids importing keystatic.config (large graph) for the Keystatic admin segment.
 */
import { notFound } from 'next/navigation';

export default function KeystaticLayout({ children }: { children: React.ReactNode }) {
  notFound();
}
