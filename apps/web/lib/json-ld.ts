/**
 * Safe JSON serialization for <script type="application/ld+json">.
 *
 * Escapes "<" so a value containing "</script>" can never terminate the
 * script element. Structured data is data, never executable code.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
