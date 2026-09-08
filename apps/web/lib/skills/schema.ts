/**
 * Digital Employee — minimale JSON-schema-validatie voor skill-input
 * (Sprint 2). Bounded subset zonder dependency: object + properties +
 * required + additionalProperties + primitieve types + bounds + enum.
 * Retourneert een lijst foutmeldingen; leeg = geldig (fail-closed: elke
 * onbekende/ongeldige eigenschap is een fout).
 */

type JsonType = "string" | "number" | "integer" | "boolean" | "object";

interface PropertySchema {
  type?: JsonType;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  enum?: readonly unknown[];
}

export type SkillInputSchema = {
  type: "object";
  properties?: Readonly<Record<string, PropertySchema>>;
  required?: readonly string[];
  additionalProperties?: boolean;
};

function typeName(value: unknown): JsonType | "array" | "null" {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  if (typeof value === "string") return "string";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "object") return "object";
  return "string"; // onbereikbaar voor JSON-input
}

function validateProperty(
  path: string,
  value: unknown,
  schema: PropertySchema | undefined,
  issues: string[],
): void {
  if (schema === undefined) return;
  const actual = typeName(value);
  if (schema.type !== undefined && schema.type !== actual) {
    // integer accepteert ook number? Nee: strict — schema zegt integer.
    issues.push(`${path}: expected ${schema.type}, got ${actual}`);
    return;
  }
  if (actual === "string") {
    const text = value as string;
    if (schema.minLength !== undefined && text.length < schema.minLength) {
      issues.push(`${path}: shorter than ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && text.length > schema.maxLength) {
      issues.push(`${path}: longer than ${schema.maxLength}`);
    }
    if (schema.enum !== undefined && !schema.enum.includes(text)) {
      issues.push(`${path}: not in allowed values`);
    }
  }
  if ((actual === "number" || actual === "integer") && typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      issues.push(`${path}: below minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      issues.push(`${path}: above maximum ${schema.maximum}`);
    }
  }
}

export function validateSkillInput(schema: SkillInputSchema, input: unknown): string[] {
  const issues: string[] = [];
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return ["input must be an object"];
  }
  const record = input as Record<string, unknown>;

  for (const key of schema.required ?? []) {
    if (!(key in record)) issues.push(`missing required field: ${key}`);
  }

  const properties = schema.properties ?? {};
  for (const [key, value] of Object.entries(record)) {
    const propertySchema = properties[key];
    if (propertySchema === undefined) {
      if (schema.additionalProperties === false) issues.push(`unknown field: ${key}`);
      continue;
    }
    if (value !== undefined) validateProperty(key, value, propertySchema, issues);
  }
  return issues;
}
