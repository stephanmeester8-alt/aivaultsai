/**
 * Prospect Acquisition Pipeline — follow-up conceptgenerator (Fase 3, regel 7).
 *
 * Een follow-up wordt ALLEEN als concept (DRAFT) aangemaakt. Verzending is
 * een afzonderlijke, door de mens goedgekeurde stap (canSendFollowUp).
 *
 * De standaardtekst is de door de opdrachtgever vastgestelde follow-up.
 * Alleen de middelste alinea wordt per bedrijf aangepast op basis van
 * sector, website en eerdere personalisatie. Geen verkooppraat, emoji's,
 * kunstmatige formuleringen of verzonnen claims.
 */

import type { Prospect } from "./types.ts";

export interface FollowUpDraft {
  subject: string;
  body: string;
  optOutLine: string;
}

export const FOLLOW_UP_SUBJECT_DEFAULT = "Re: AI-assistent voor jullie website";

export const FOLLOW_UP_OPT_OUT_LINE =
  "Geen interesse? Laat het weten, dan nemen we jullie uit de lijst.";

const OPENING =
  "Goedendag,\n\nIk wilde even controleren of mijn eerdere bericht over een AI-assistent voor jullie website goed is aangekomen.";

const CLOSING = `Met vriendelijke groet,

Stephan Meester
AI Vaults
https://www.aivaultsai.one
https://www.linkedin.com/in/stephan-meester-758566374`;

/**
 * Bouw een gepersonaliseerde middenalinea zonder claims te verzinnen.
 * Gebruikt alleen feitelijke, beschikbare context (sector/website/hoek).
 */
export function buildPersonalizedMiddle(prospect: Prospect): string {
  const angle = prospect.personalizationAngle?.trim();
  if (angle && angle.length > 0) {
    return `Ik kan vrijblijvend een korte voorbeeldversie laten zien, zodat direct zichtbaar wordt hoe dit binnen jullie bedrijf kan werken. ${angle}`;
  }
  const sector = prospect.industry?.trim();
  if (sector && sector.length > 0) {
    return `Ik kan vrijblijvend een korte voorbeeldversie laten zien, zodat direct zichtbaar wordt hoe een AI-assistent binnen ${sector} kan werken. Is dat interessant?`;
  }
  return "Ik kan vrijblijvend een korte voorbeeldversie laten zien, zodat direct zichtbaar wordt hoe dit binnen jullie bedrijf kan werken. Is dat interessant?";
}

/** Standaard follow-up als concept (nooit verzonden vanuit deze functie). */
export function buildFollowUpDraft(prospect: Prospect): FollowUpDraft {
  return {
    subject: FOLLOW_UP_SUBJECT_DEFAULT,
    body: `${OPENING}\n\n${buildPersonalizedMiddle(prospect)}\n\n${CLOSING}`,
    optOutLine: FOLLOW_UP_OPT_OUT_LINE,
  };
}

/**
 * Antwoordconcept bij INTERESTED: persoonlijk antwoord met als doel een
 * vrijblijvende demo van vijftien minuten in te plannen. Ook dit is een
 * concept — verzending blijft afhankelijk van goedkeuring.
 */
export function buildInterestedReplyDraft(prospect: Prospect): FollowUpDraft {
  const company = prospect.companyName.trim();
  return {
    subject: "Re: AI-assistent voor jullie website",
    body: `Beste,\n\nFijn dat jullie geïnteresseerd zijn in een AI-assistent voor ${company}.

Ik stel voor om vrijblijvend vijftien minuten in te plannen om kort te laten zien hoe dit binnen jullie bedrijf kan werken en welke mogelijkheden er zijn. Welke dag en tijd past jullie het beste?

Met vriendelijke groet,

Stephan Meester
AI Vaults
https://www.aivaultsai.one
https://www.linkedin.com/in/stephan-meester-758566374`,
    optOutLine: FOLLOW_UP_OPT_OUT_LINE,
  };
}
