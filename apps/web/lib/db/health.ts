import { sql } from "./client";

export async function checkDatabaseConnection(): Promise<boolean> {
  const result = await sql`SELECT 1 AS ok`;

  return result[0]?.ok === 1;
}