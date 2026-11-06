/**
 * Serialize a JSON-LD object for a `<script type="application/ld+json">`
 * body. `<` is escaped so content-derived strings (video titles,
 * summaries) containing `</script>` can't close the tag early.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
