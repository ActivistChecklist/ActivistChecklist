/**
 * Small label above a list in guide content, e.g. "Top resources". It is a real
 * h3 so screen reader users can jump to it by heading, but styled small and
 * muted so it doesn't read as another heading level. Guides list only h2s in
 * their table of contents unless `tocDepth: '3'` is set, so it stays out of it.
 *
 * Usage in MDX: <ListLabel>Top resources</ListLabel>
 */
export default function ListLabel({ children }) {
  return (
    <h3 className="mt-6 mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}
