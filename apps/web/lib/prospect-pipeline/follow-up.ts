/**
 * Prospect Acquisition Pipeline — follow-up regels (Fase 3).
 *
 * Pure, testbare regels. Deze module verstuurt NOOIT e-mail en roept geen
 * externe provider aan. Uitgangspunten:
 *  1. na de eerste e-mail: status WAITING_FOR_REPLY;
 *  2. follow-up pas na >= 2 volledige werkdagen (business-days.ts);
 *  3. bij reactie: REPLIED + menselijke beoordeling, geen automatische
 *     follow-up;
 *  4. bij bounce: BOUNCED, geen nieuwe verzending;
 *  5. bij afmelding/negatief: DO_NOT_CONTACT of LOST, alle opvolging
 *     geblokkeerd;
 *  6. maximaal één follow-up;
 *  7. follow-up wordt alleen als CONCEPT (DRAFT) aangemaakt;
 *  8. verzending vereist een afzonderlijke approval;
 *  9. vlak vóór verzending wordt alles opnieuw gecontroleerd.
 *
 * Een "verzending" is hier een puur administratieve statusovergang
 * (SENT) die uitsluitend mag plaatsvinden via een approval-gate — nooit
 * automatisch. De werkelijke e-mailtransport blijft buiten deze module.
 */

import type {
  Prospect,
  ProspectOutreach,
  ProspectStatus,
} from "./types.ts";
import { followUpMinWaitElapsed } from "./business-days.ts";

/** Waarom een follow-up (nog) niet is toegestaan. */
export type FollowUpBlockReason =
  | "NOT_SENT_YET" // geen eerste e-mail verzonden
  | "MIN_WAIT_NOT_ELAPSED" // < 2 volledige werkdagen
  | "ALREADY_REPLIED" // reactie ontvangen
  | "BOUNCED"
  | "DO_NOT_CONTACT"
  | "STATUS_TERMINAL" // WON / LOST / DEMO_SCHEDULED etc.
  | "FOLLOW_UP_EXISTS" // al een follow-up (concept/verzonden)
  | "REQUIRES_HUMAN"; // reactie heeft menselijke beoordeling nodig

export type FollowUpDecision =
  | { allowed: true; reason: "FOLLOW_UP_DUE" }
  | { allowed: false; reason: FollowUpBlockReason };

const TERMINAL_STATUSES: ReadonlySet<ProspectStatus> = new Set([
  "WON",
  "LOST",
  "DO_NOT_CONTACT",
  "BOUNCED",
  "DEMO_SCHEDULED",
]);

/**
 * Mag een follow-up worden VOORBEREID (concept) voor deze prospect?
 * Vóór de daadwerkelijke verzending wordt opnieuw gecontroleerd
 * (canSendFollowUp).
 */
export function canPrepareFollowUp(input: {
  prospect: Prospect;
  firstEmailSentAt: Date | string | null;
  now: Date;
  existingFollowUp: ProspectOutreach | null;
}): FollowUpDecision {
  const { prospect } = input;

  // Specifieke redenen gaan vóór de generieke terminal-check, zodat de
  // operator de exacte blokkade ziet (bounce, reactie, dnc, eindstatus).
  if (prospect.doNotContact || prospect.status === "DO_NOT_CONTACT") {
    return { allowed: false, reason: "DO_NOT_CONTACT" };
  }
  if (prospect.status === "BOUNCED") {
    return { allowed: false, reason: "BOUNCED" };
  }
  if (prospect.status === "REPLIED") {
    return { allowed: false, reason: "ALREADY_REPLIED" };
  }
  if (TERMINAL_STATUSES.has(prospect.status)) {
    return { allowed: false, reason: "STATUS_TERMINAL" };
  }
  if (!input.firstEmailSentAt) {
    return { allowed: false, reason: "NOT_SENT_YET" };
  }
  if (input.existingFollowUp) {
    return { allowed: false, reason: "FOLLOW_UP_EXISTS" };
  }
  if (!followUpMinWaitElapsed(input.firstEmailSentAt, input.now)) {
    return { allowed: false, reason: "MIN_WAIT_NOT_ELAPSED" };
  }
  return { allowed: true, reason: "FOLLOW_UP_DUE" };
}

/** Blokkades die bij EEN reactie op de prospect worden gezet. */
export function statusAfterReply(classification: string): ProspectStatus {
  switch (classification) {
    case "UNSUBSCRIBE":
      return "DO_NOT_CONTACT";
    case "NOT_INTERESTED":
      return "LOST";
    default:
      return "REPLIED";
  }
}

/**
 * Laatste controle vlak vóór verzending (regel 9). Verzending mag alleen
 * wanneer een goedgekeurde (APPROVED) follow-up bestaat en de prospect nog
 * steeds follow-up-waardig is. Deze functie is de approval-gate: zonder
 * `approvedFollowUp` is verzending altijd geblokkeerd.
 */
export function canSendFollowUp(input: {
  prospect: Prospect;
  approvedFollowUp: ProspectOutreach | null;
  expectedFromAddress: string;
}):
  | { allowed: true }
  | { allowed: false; reason: string } {
  if (input.prospect.doNotContact || input.prospect.status === "DO_NOT_CONTACT") {
    return { allowed: false, reason: "DO_NOT_CONTACT" };
  }
  if (input.prospect.status === "BOUNCED") {
    return { allowed: false, reason: "BOUNCED" };
  }
  if (input.prospect.status === "REPLIED") {
    return { allowed: false, reason: "ALREADY_REPLIED" };
  }
  if (!input.approvedFollowUp) {
    return { allowed: false, reason: "FOLLOW_UP_NOT_APPROVED" };
  }
  if (input.approvedFollowUp.status !== "APPROVED") {
    return { allowed: false, reason: "FOLLOW_UP_NOT_APPROVED" };
  }
  // De follow-up moet door de juiste afzender zijn opgesteld.
  if (
    input.approvedFollowUp.fromAddress.trim().toLowerCase() !==
    input.expectedFromAddress.trim().toLowerCase()
  ) {
    return { allowed: false, reason: "WRONG_SENDER" };
  }
  return { allowed: true };
}

/** Korte samenvatting van een blokkade (voor logging/UI, nooit e-mail). */
export function describeBlock(reason: FollowUpBlockReason): string {
  switch (reason) {
    case "NOT_SENT_YET":
      return "Geen eerste e-mail verzonden — follow-up niet toegestaan.";
    case "MIN_WAIT_NOT_ELAPSED":
      return "Minimale wachttijd (2 volledige werkdagen) nog niet verstreken.";
    case "ALREADY_REPLIED":
      return "Reactie ontvangen — geen automatische follow-up; menselijke beoordeling vereist.";
    case "BOUNCED":
      return "Bounce geregistreerd — geen nieuwe verzending.";
    case "DO_NOT_CONTACT":
      return "Do-not-contact — alle opvolging geblokkeerd.";
    case "STATUS_TERMINAL":
      return "Status is eindig — geen verdere opvolging.";
    case "FOLLOW_UP_EXISTS":
      return "Er bestaat al een follow-up — maximaal één follow-up.";
    case "REQUIRES_HUMAN":
      return "Menselijke beoordeling vereist.";
  }
}
