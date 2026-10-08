export default function imageLoader({ src, width, quality }) {
  const isDev = process.env.NODE_ENV === 'development';

  // In development, use external CDN with width and quality params
  if (isDev) {
    return `${src}?w=${width}&q=${quality || 75}`;
  }

  // In production, use local images
  const filename = src.split('/').pop();
  return `/images/${filename}`;
}
