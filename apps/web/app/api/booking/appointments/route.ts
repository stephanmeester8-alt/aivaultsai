import { NextResponse } from "next/server";
import { BookingService } from "@/lib/booking/service";
import { MockCalendarProvider } from "@/lib/booking/providers/mock-calendar-provider";

export const runtime = "nodejs";

const bookingService = new BookingService(
  new MockCalendarProvider(),
);

type AppointmentBody = {
  leadId?: unknown;
  conversationId?: unknown;
  start?: unknown;
  end?: unknown;
  timezone?: unknown;
  contactMethod?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  notes?: unknown;
};

type ParsedAppointmentBody = {
  leadId: string;
  conversationId: string;
  start: string;
  end: string;
  timezone: string;
  contactMethod: "phone" | "video" | "in_person";
  name?: string;
  email?: string;
  phone?: string;
  notes?: string;
};

function parseAppointmentBody(
  body: AppointmentBody,
):
  | {
      valid: true;
      data: ParsedAppointmentBody;
    }
  | {
      valid: false;
    } {
  if (
    typeof body.leadId !== "string" ||
    typeof body.conversationId !== "string" ||
    typeof body.start !== "string" ||
    typeof body.end !== "string" ||
    typeof body.timezone !== "string"
  ) {
    return { valid: false };
  }

  if (
    body.contactMethod !== "phone" &&
    body.contactMethod !== "video" &&
    body.contactMethod !== "in_person"
  ) {
    return { valid: false };
  }

  return {
    valid: true,
    data: {
      leadId: body.leadId,
      conversationId: body.conversationId,
      start: body.start,
      end: body.end,
      timezone: body.timezone,
      contactMethod: body.contactMethod,
      name:
        typeof body.name === "string"
          ? body.name
          : undefined,
      email:
        typeof body.email === "string"
          ? body.email
          : undefined,
      phone:
        typeof body.phone === "string"
          ? body.phone
          : undefined,
      notes:
        typeof body.notes === "string"
          ? body.notes
          : undefined,
    },
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AppointmentBody;
    const parsed = parseAppointmentBody(body);

    if (!parsed.valid) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid appointment request.",
        },
        { status: 400 },
      );
    }

    const appointment =
      await bookingService.createAppointment(
        parsed.data,
      );

    return NextResponse.json({
      ok: true,
      appointment,
    });
  } catch (error) {
    console.error(
      "Appointment creation failed:",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error: "Unable to create appointment.",
      },
      { status: 500 },
    );
  }
}