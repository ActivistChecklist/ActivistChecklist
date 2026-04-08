export function withLocalePath(locale: string, sitePath: string): string {
  const normalized = sitePath.startsWith('/') ? sitePath : `/${sitePath}`;
  return `/${locale}${normalized}`;
}
