export function withLocalePath(locale, sitePath) {
  const normalized = sitePath.startsWith('/') ? sitePath : `/${sitePath}`;
  return `/${locale}${normalized}`;
}
