export type CommercialIntentLevel =
  | "INFORMATIONAL"
  | "BUSINESS_INTEREST"
  | "COMMERCIAL_INTENT"
  | "HIGH_COMMERCIAL_INTENT";

export interface CommercialIntentResult {
  level: CommercialIntentLevel;
  detected: boolean;
  score: number;
  reasons: string[];
}

type PatternGroup = {
  name: string;
  patterns: RegExp[];
};

/*
 * ------------------------------------------------------------
 * HIGH INTENT
 *
 * Alleen expliciete conversiestappen.
 * ------------------------------------------------------------
 */

const HIGH_INTENT_GROUPS: PatternGroup[] = [
  {
    name: "appointment",
    patterns: [
      /\bafspraak maken\b/i,
      /\bafspraak plannen\b/i,
      /\bafspraak inplannen\b/i,
      /\bkennismaking\b/i,
      /\bkennismaken\b/i,
      /\bgesprek inplannen\b/i,
      /\bgesprek plannen\b/i,
      /\bdemo aanvragen\b/i,
      /\bdemo plannen\b/i,
    ],
  },
  {
    name: "contact",
    patterns: [
      /\bmijn e[- ]?mail\b/i,
      /\bmijn e[- ]?mailadres\b/i,
      /\be[- ]?mailadres\b/i,
      /\bmail me\b/i,
      /\bbel me\b/i,
      /\bneem contact op\b/i,
      /\bcontact opnemen\b/i,
      /\b\d{10}\b/i,
      /@[a-z0-9.-]+\.[a-z]{2,}\b/i,
    ],
  },
];

/*
 * ------------------------------------------------------------
 * COMMERCIAL GOALS
 *
 * We kijken naar het zakelijke doel, niet naar de branche.
 *
 * Voorbeelden:
 *
 * webshop       -> meer kleding verkopen
 * fietsenwinkel -> meer fietsen verkopen
 * restaurant    -> meer reserveringen
 * makelaar      -> meer aanvragen
 * SaaS          -> meer demo's
 * aannemer      -> meer offerteaanvragen
 * coach         -> meer klanten
 * ------------------------------------------------------------
 */

const COMMERCIAL_GOAL_GROUPS: PatternGroup[] = [
  {
    name: "sales",
    patterns: [
      /\bmeer klanten\b/i,
      /\bmeer leads\b/i,
      /\bmeer aanvragen\b/i,
      /\bmeer verkopen\b/i,
      /\bmeer omzet\b/i,
      /\bmeer boekingen\b/i,
      /\bmeer reserveringen\b/i,
      /\bmeer afspraken\b/i,
      /\bmeer demo'?s\b/i,
      /\bmeer offerteaanvragen\b/i,
      /\bmeer offerte aanvragen\b/i,
      /\bklanten binnenhalen\b/i,
      /\bklanten werven\b/i,
      /\bleads genereren\b/i,
      /\bleads krijgen\b/i,
      /\bleads binnenhalen\b/i,
      /\bverkoop verhogen\b/i,
      /\bverkopen verhogen\b/i,
      /\bconversie verhogen\b/i,
      /\bconversie verbeteren\b/i,
      /\baanvragen genereren\b/i,
      /\bboekingen genereren\b/i,

      /*
       * Product-specifieke verkoop.
       *
       * Hiermee werkt bijvoorbeeld:
       *
       * "meer kleding verkopen"
       * "meer fietsen verkopen"
       * "meer auto's verkopen"
       * "meer producten verkopen"
       */
      /\bmeer\s+\w+(?:\s+\w+){0,2}\s+verkopen\b/i,

      /\bproducten verkopen\b/i,
      /\bkleding verkopen\b/i,
      /\bfietsen verkopen\b/i,
    ],
  },
  {
    name: "automation",
    patterns: [
      /\bautomatiseren\b/i,
      /\bautomatisering\b/i,
      /\bautomatisch opvolgen\b/i,
      /\bautomatische opvolging\b/i,
      /\bleadopvolging\b/i,
      /\blead opvolging\b/i,
      /\baanvragen opvolgen\b/i,
      /\bklanten opvolgen\b/i,
      /\bfollow[- ]?up\b/i,
      /\bworkflow automatiseren\b/i,
      /\bprocessen automatiseren\b/i,
    ],
  },
];

/*
 * ------------------------------------------------------------
 * PROJECT / SOLUTION INTENT
 * ------------------------------------------------------------
 */

const PROJECT_INTENT_GROUPS: PatternGroup[] = [
  {
    name: "quote",
    patterns: [
      /\bofferte\b/i,
      /\bofferte aanvragen\b/i,
      /\bprijsopgave\b/i,
      /\bwat kost\b/i,
      /\bwat kost een\b/i,
      /\bprijs\b/i,
      /\bkosten\b/i,
    ],
  },
  {
    name: "solution",
    patterns: [
      /\bai[- ]?assistent\b/i,
      /\bchatbot\b/i,
      /\bai oplossing\b/i,
      /\bai-oplossing\b/i,
      /\bai systeem\b/i,
      /\bai-systeem\b/i,
      /\blead generatie\b/i,
      /\bleadgeneratie\b/i,
      /\bleadopvang\b/i,
      /\bleadkwalificatie\b/i,
      /\bcrm koppeling\b/i,
      /\bcrm-koppeling\b/i,
    ],
  },
];

/*
 * ------------------------------------------------------------
 * INFORMATIONAL
 *
 * Deze patronen maken een bericht NIET commercieel.
 * ------------------------------------------------------------
 */

const INFORMATIONAL_PATTERNS = [
  /^wat kunnen jullie met ai\b/i,
  /^wat kunnen jullie\b/i,
  /^wat doet aivaultsai\b/i,
  /^hoe werkt dit\b/i,
  /^hoe werkt jullie\b/i,
  /^wat is ai\b/i,
  /^kun je uitleggen\b/i,
  /^kunnen jullie uitleggen\b/i,
  /^ik ben benieuwd\b/i,
  /^vertel eens\b/i,
];

/*
 * ------------------------------------------------------------
 * BUSINESS CONTEXT
 *
 * Alleen branche/bedrijf noemen is geen commerciële intentie.
 *
 * "Ik heb een bedrijf in de bouw."
 * "Ik heb een fietsenwinkel."
 * "Ik heb een webshop."
 *
 * -> INFORMATIONAL
 * ------------------------------------------------------------
 */

const BUSINESS_CONTEXT_PATTERNS = [
  /\bik heb een bedrijf\b/i,
  /\bwij hebben een bedrijf\b/i,
  /\bwe hebben een bedrijf\b/i,
  /\bmijn bedrijf\b/i,
  /\bons bedrijf\b/i,
  /\bonze onderneming\b/i,
  /\bmijn webshop\b/i,
  /\bonze webshop\b/i,
  /\bmijn winkel\b/i,
  /\bonze winkel\b/i,
  /\bmijn zaak\b/i,
  /\bonze zaak\b/i,
];

/*
 * ------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------
 */

function collectMatches(
  text: string,
  groups: PatternGroup[],
): string[] {
  const reasons: string[] = [];

  for (const group of groups) {
    for (const pattern of group.patterns) {
      if (pattern.test(text)) {
        reasons.push(`${group.name}:${pattern.source}`);
      }
    }
  }

  return reasons;
}

function hasBusinessContext(text: string): boolean {
  return BUSINESS_CONTEXT_PATTERNS.some((pattern) =>
    pattern.test(text),
  );
}

function hasInformationalIntent(text: string): boolean {
  return INFORMATIONAL_PATTERNS.some((pattern) =>
    pattern.test(text),
  );
}

/*
 * ------------------------------------------------------------
 * MAIN CLASSIFIER
 * ------------------------------------------------------------
 */

export function detectCommercialIntent(
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>,
): CommercialIntentResult {
  const text = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n")
    .trim();

  if (!text) {
    return {
      level: "INFORMATIONAL",
      detected: false,
      score: 0,
      reasons: [],
    };
  }

  /*
   * ----------------------------------------------------------
   * 1. HIGH INTENT
   *
   * Afspraak / demo / kennismaking / contactgegevens.
   * ----------------------------------------------------------
   */

  const highIntentReasons = collectMatches(
    text,
    HIGH_INTENT_GROUPS,
  );

  if (highIntentReasons.length > 0) {
    return {
      level: "HIGH_COMMERCIAL_INTENT",
      detected: true,
      score: 9,
      reasons: highIntentReasons,
    };
  }

  /*
   * ----------------------------------------------------------
   * 2. COMMERCIAL GOALS
   * ----------------------------------------------------------
   */

  const commercialReasons = collectMatches(
    text,
    COMMERCIAL_GOAL_GROUPS,
  );

  /*
   * ----------------------------------------------------------
   * 3. PROJECT / SOLUTION
   * ----------------------------------------------------------
   */

  const projectReasons = collectMatches(
    text,
    PROJECT_INTENT_GROUPS,
  );

  /*
   * ----------------------------------------------------------
   * 4. AUTOMATION + COMMERCIAL GOAL
   *
   * Een combinatie zoals:
   *
   * "aanvragen automatisch opvolgen en meer klanten binnenhalen"
   *
   * is een zeer sterke commerciële intentie.
   * ----------------------------------------------------------
   */

  const hasAutomation = commercialReasons.some((reason) =>
    reason.startsWith("automation:"),
  );

  const hasSalesGoal = commercialReasons.some((reason) =>
    reason.startsWith("sales:"),
  );

  if (hasAutomation && hasSalesGoal) {
    return {
      level: "HIGH_COMMERCIAL_INTENT",
      detected: true,
      score: 10,
      reasons: commercialReasons,
    };
  }

  /*
   * ----------------------------------------------------------
   * 5. NORMALE COMMERCIAL INTENT
   *
   * Een concreet zakelijk doel is voldoende.
   *
   * Bijvoorbeeld:
   *
   * "meer kleding verkopen"
   * "meer fietsen verkopen"
   * "meer reserveringen"
   * "meer leads"
   * "meer klanten"
   * ----------------------------------------------------------
   */

  if (commercialReasons.length > 0) {
    return {
      level: "COMMERCIAL_INTENT",
      detected: true,
      score: 5,
      reasons: commercialReasons,
    };
  }

  /*
   * ----------------------------------------------------------
   * 6. PROJECT / OFFERTE / OPLOSSING
   * ----------------------------------------------------------
   */

  if (projectReasons.length > 0) {
    return {
      level: "COMMERCIAL_INTENT",
      detected: true,
      score: 4,
      reasons: projectReasons,
    };
  }

  /*
   * ----------------------------------------------------------
   * 7. ALLEEN BEDRIJFSCONTEXT
   *
   * Dit is bewust GEEN lead.
   * ----------------------------------------------------------
   */

  if (hasBusinessContext(text)) {
    return {
      level: "INFORMATIONAL",
      detected: false,
      score: 0,
      reasons: [],
    };
  }

  /*
   * ----------------------------------------------------------
   * 8. PUUR INFORMATIEF
   * ----------------------------------------------------------
   */

  if (hasInformationalIntent(text)) {
    return {
      level: "INFORMATIONAL",
      detected: false,
      score: 0,
      reasons: [],
    };
  }

  /*
   * ----------------------------------------------------------
   * 9. BUSINESS INTEREST
   *
   * Zakelijke context, maar nog geen concrete commerciële actie.
   * ----------------------------------------------------------
   */

  return {
    level: "BUSINESS_INTEREST",
    detected: false,
    score: 1,
    reasons: [],
  };
}