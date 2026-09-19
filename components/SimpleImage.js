/**
 * SimpleImage — a plain <img> with no ImageEmbed chrome.
 * Use for badges, icons, or any image that shouldn't get block layout,
 * borders, shadows, or forced sizing.
 *
 * <SimpleImage src="/images/badges/foo.svg" alt="..." />
 */
export function SimpleImage({ src, alt = '', className, style, ...props }) {
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} style={style} {...props} />;
}

export default SimpleImage;
