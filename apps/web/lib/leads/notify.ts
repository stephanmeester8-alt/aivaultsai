/**
 * Lead-formulier — interne e-mailnotificatie via Resend (server-only).
 *
 * Bewust zonder SDK-dependency: de officiële Resend REST API wordt met
 * fetch aangeroepen. De notificatie is secundair aan de database-insert:
 * de caller vangt fouten hier af, logt ze en retourneert tóch succes aan
 * de bezoeker (de lead staat al in de database).
 *
 * Geen credentials in client-code; alle waarden komen uit server-env.
 */

const RESEND_API_BASE = "https://api.resend.com/emails";

export interface LeadNotification {
  leadId: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  service: string;
  message: string;
  source: string;
  submittedAt: string;
}

export interface ResendConfig {
  apiKey: string;
  from: string;
  to: string;
}

export type ResendFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface ResendEmailInput {
  subject: string;
  text: string;
}

/** Lage Resend-kernel: verstuurt één e-mail (from/to uit config). */
export function createResendSender(
  config: ResendConfig,
  fetchImpl: ResendFetch = fetch as unknown as ResendFetch,
) {
  return async function sendEmail(input: ResendEmailInput): Promise<void> {
    const response = await fetchImpl(RESEND_API_BASE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: [config.to],
        subject: input.subject,
        text: input.text,
      }),
    });

    if (!response.ok) {
      throw new Error(`RESEND_API_ERROR:${response.status}`);
    }
  };
}

export type ResendSender = ReturnType<typeof createResendSender>;

export function createLeadNotifier(
  config: ResendConfig,
  fetchImpl: ResendFetch = fetch as unknown as ResendFetch,
) {
  const send = createResendSender(config, fetchImpl);
  return async function sendLeadNotification(lead: LeadNotification): Promise<void> {
    const subject = `Nieuwe lead via AIVaultsAI — ${lead.name}`;
    const lines = [
      `Naam: ${lead.name}`,
      `E-mail: ${lead.email}`,
      `Telefoon: ${lead.phone ?? "-"}`,
      `Bedrijf: ${lead.company ?? "-"}`,
      `Gevraagde dienst: ${lead.service}`,
      "",
      "Bericht:",
      lead.message,
      "",
      `Bron: ${lead.source}`,
      `Inzending: ${lead.submittedAt}`,
      `Lead ID: ${lead.leadId}`,
    ];

    await send({ subject, text: lines.join("\n") });
  };
}

export type LeadNotifier = ReturnType<typeof createLeadNotifier>;
