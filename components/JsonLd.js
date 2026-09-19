import { serializeJsonLd } from '@/lib/structured-data';

/**
 * Inline JSON-LD <script> for search engines and LLM crawlers.
 *
 * Pass any JSON-serializable object (typically a schema.org @graph from
 * lib/structured-data). The output is rendered server-side and inlined into
 * the static HTML so crawlers see it without executing JS.
 */
export default function JsonLd({ data }) {
  if (!data) return null;
  return (
    <script
      type="application/ld+json"
      // dangerouslySetInnerHTML is required for JSON-LD — React text-content
      // would HTML-encode the JSON. serializeJsonLd escapes the </script>
      // closing-tag sequence and HTML-significant chars to keep this safe.
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
