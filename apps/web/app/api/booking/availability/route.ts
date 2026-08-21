import { NextResponse } from "next/server";
import { BookingService } from "@/lib/booking/service";
import { createProductionCalendarProvider } from "@/lib/booking/provider-factory";

export const runtime = "nodejs";

// Production path: selects the explicit unavailable state until a real
// calendar integration exists. Never invents slots.
const bookingService = new BookingService(
  createProductionCalendarProvider(),
);

type AvailabilityBody = {
  startDate?: unknown;
  endDate?: unknown;
  timezone?: unknown;
  durationMinutes?: unknown;
};

function parseAvailabilityBody(
  body: AvailabilityBody,
):
  | {
      valid: true;
      data: {
        startDate: string;
        endDate: string;
        timezone: string;
        durationMinutes: number;
      };
    }
  | {
      valid: false;
    } {
  if (
    typeof body.startDate !== "string" ||
    typeof body.endDate !== "string" ||
    typeof body.timezone !== "string" ||
    typeof body.durationMinutes !== "number"
  ) {
    return { valid: false };
  }

  return {
    valid: true,
    data: {
      startDate: body.startDate,
      endDate: body.endDate,
      timezone: body.timezone,
      durationMinutes: body.durationMinutes,
    },
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AvailabilityBody;
    const parsed = parseAvailabilityBody(body);

    if (!parsed.valid) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid availability request.",
        },
        { status: 400 },
      );
    }

    const result = await bookingService.getAvailability(
      parsed.data,
    );

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error("Booking availability failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Unable to retrieve availability.",
      },
      { status: 500 },
    );
  }
}