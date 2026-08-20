import { serializeJsonLd } from "@/lib/json-ld";

/**
 * Renders a JSON-LD block safely. The serializer escapes "<" so a value
 * containing "</script>" cannot break out of the script context.
 */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
