import { NextResponse } from "next/server";
import { checkDatabaseConnection } from "@/lib/db/health";

export async function GET() {
  try {
    const connected = await checkDatabaseConnection();

    if (!connected) {
      return NextResponse.json(
        {
          ok: false,
          database: "unavailable",
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      database: "connected",
    });
  } catch (error) {
    console.error("Database health check failed:", error);

    return NextResponse.json(
      {
        ok: false,
        database: "error",
      },
      { status: 500 },
    );
  }
}