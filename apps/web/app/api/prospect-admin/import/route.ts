import { NextResponse } from "next/server";
import {
  getSiteTenantId,
  readJson,
  requireAdminKey,
} from "@/lib/prospect-pipeline/admin-auth";
import type { ProspectSql } from "@/lib/prospect-pipeline/repository";

export const runtime = "nodejs";

/** Veilige limieten voor de import-payload. */
const MAX_IMPORT_ROWS = 1000;
const MAX_XLSX_BYTES = 4 * 1024 * 1024;

type ImportPayload = {
  /** 'dry-run' (default) of 'execute'. Executie vereist expliciete bevestiging. */
  mode?: "dry-run" | "execute";
  /** Rijen als JSON-array (CSV/XLSX-alternatief). */
  rows?: unknown[];
  /** Raw CSV-tekst. */
  csv?: string;
  /** Base64-gecodeerd XLSX-bestand. */
  xlsxBase64?: string;
  /**
   * Executie mag alleen met confirm:true — beschermt tegen onbedoelde
   * imports. Er wordt NOOIT e-mail verstuurd; alleen database-inserts.
   */
  confirm?: boolean;
};

function isImportPayload(value: unknown): value is ImportPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  if (body.mode !== undefined && body.mode !== "dry-run" && body.mode !== "execute") {
    return false;
  }
  if (body.rows !== undefined && !Array.isArray(body.rows)) return false;
  if (body.csv !== undefined && typeof body.csv !== "string") return false;
  if (body.xlsxBase64 !== undefined && typeof body.xlsxBase64 !== "string") return false;
  if (body.confirm !== undefined && typeof body.confirm !== "boolean") return false;
  return true;
}

/** Admin-only importroute: dry-run eerst, executie pas na expliciete bevestiging. */
export async function POST(request: Request) {
  const denied = requireAdminKey(request);
  if (denied) return denied;

  let data: unknown;
  try {
    data = await readJson(request);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!isImportPayload(data)) {
    return NextResponse.json({ error: "Invalid import request." }, { status: 400 });
  }
  const mode = data.mode ?? "dry-run";

  try {
    const tenantId = getSiteTenantId();
    const { sql } = await import("@/lib/db/client");
    const {
      classifyImport,
      createDatabaseImportLookup,
      executeImport,
      mapRowsToImport,
      parseCsvToRows,
      parseXlsxToRows,
    } = await import("@/lib/prospect-pipeline/import");
    const lookup = createDatabaseImportLookup(
      sql as unknown as ProspectSql,
      tenantId,
    );

    let rawRows: Record<string, unknown>[];
    let source: string;
    if (data.rows !== undefined) {
      rawRows = (data.rows as unknown[]).map((r) => {
        if (!r || typeof r !== "object" || Array.isArray(r)) {
          throw new Error("INVALID_ROW");
        }
        return r as Record<string, unknown>;
      });
      source = "json";
    } else if (data.csv !== undefined) {
      rawRows = parseCsvToRows(data.csv);
      source = "csv";
    } else if (data.xlsxBase64 !== undefined) {
      if (data.xlsxBase64.length > MAX_XLSX_BYTES * 1.34) {
        return NextResponse.json({ error: "XLSX is too large." }, { status: 413 });
      }
      const buffer = Buffer.from(data.xlsxBase64, "base64");
      rawRows = parseXlsxToRows(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
      source = "xlsx";
    } else {
      return NextResponse.json({ error: "No import data provided." }, { status: 400 });
    }

    if (rawRows.length === 0) {
      return NextResponse.json(
        { error: "No rows found in import data." },
        { status: 400 },
      );
    }
    if (rawRows.length > MAX_IMPORT_ROWS) {
      return NextResponse.json(
        { error: `Too many rows (max ${MAX_IMPORT_ROWS}).` },
        { status: 413 },
      );
    }

    const mapped = mapRowsToImport(rawRows).map((entry, index) => ({
      row: entry.row,
      rowNumber: index + 2, // regel 1 = header
    }));

    if (mode === "execute") {
      if (data.confirm !== true) {
        return NextResponse.json(
          {
            error:
              "Executie vereist expliciete bevestiging (confirm:true). Voer eerst een dry-run uit en controleer het rapport.",
          },
          { status: 409 },
        );
      }
      const result = await executeImport(
        sql as never,
        tenantId,
        mapped,
      );
      return NextResponse.json(
        {
          ok: true,
          source,
          executed: true,
          inserted: result.inserted,
          skipped: result.skipped.length,
          skippedRows: result.skipped.slice(0, 100),
        },
        { status: 200 },
      );
    }

    const report = await classifyImport(mapped, lookup);
    return NextResponse.json(
      {
        ok: true,
        source,
        dryRun: true,
        totalRows: report.totalRows,
        newCount: report.newCount,
        duplicateCount: report.duplicateCount,
        skippedCount: report.skippedCount,
        rows: report.rows.slice(0, 100),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error(
      "[prospect-admin] import failed",
      error instanceof Error ? error.name : "unknown",
    );
    return NextResponse.json(
      { error: "Import could not be completed." },
      { status: 500 },
    );
  }
}
