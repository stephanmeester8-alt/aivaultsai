import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL);

const appointmentId = "bf8a6e78-ddfc-45a3-9040-fc47e25083f5";

try {
  const appointments = await sql`
    SELECT
      appointment_id,
      lead_id,
      conversation_id,
      status,
      scheduled_start,
      scheduled_end,
      timezone,
      contact_method,
      external_calendar_event_id,
      created_at
    FROM appointments
    WHERE appointment_id = ${appointmentId}::uuid
  `;

  console.log("\nAPPOINTMENT");
  console.table(appointments);

  if (appointments.length === 0) {
    console.error("FAIL: appointment not found");
    process.exitCode = 1;
    return;
  }

  const appointment = appointments[0];

  const events = await sql`
    SELECT
      event_id,
      lead_id,
      conversation_id,
      event_type,
      source,
      origin,
      metadata,
      created_at
    FROM lead_events
    WHERE lead_id = ${appointment.lead_id}::uuid
    ORDER BY created_at DESC
  `;

  console.log("\nLEAD EVENTS");
  console.table(events);

  const bookingEvent = events.find(
    (event) =>
      event.event_type === "appointment_request_submitted" ||
      event.event_type === "lead_created" ||
      event.event_type === "follow_up_requested",
  );

  if (!bookingEvent) {
    console.error("FAIL: no relevant lead event found");
    process.exitCode = 1;
    return;
  }

  console.log("\nPASS: appointment persistence verified");
  console.log("Appointment:", appointment.appointment_id);
  console.log("Lead:", appointment.lead_id);
  console.log("Conversation:", appointment.conversation_id);
  console.log("Event:", bookingEvent.event_id);
} finally {
  await sql.end();
}