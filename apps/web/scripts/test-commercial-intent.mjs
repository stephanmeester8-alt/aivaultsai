const tests = [
  {
    name: "Algemene informatie",
    text: "Wat kunnen jullie met AI?",
    level: "INFORMATIONAL",
    detected: false,
  },
  {
    name: "Webshop informatie",
    text: "Ik heb een webshop. Wat kunnen jullie met AI?",
    level: "INFORMATIONAL",
    detected: false,
  },
  {
    name: "Webshop meer verkopen",
    text: "Ik heb een online shop en ik wil meer kleding verkopen.",
    level: "COMMERCIAL_INTENT",
    detected: true,
  },
  {
    name: "Fietsenwinkel meer verkopen",
    text: "Ik heb een fietsenwinkel en ik wil meer fietsen verkopen.",
    level: "COMMERCIAL_INTENT",
    detected: true,
  },
  {
    name: "Fietsenwinkel meer leads",
    text: "Ik heb een fietsenwinkel en ik wil meer leads krijgen.",
    level: "COMMERCIAL_INTENT",
    detected: true,
  },
  {
    name: "Restaurant meer reserveringen",
    text: "Wij hebben een restaurant en willen meer reserveringen.",
    level: "COMMERCIAL_INTENT",
    detected: true,
  },
  {
    name: "Makelaar meer aanvragen",
    text: "Ik ben makelaar en wil meer aanvragen van potentiële klanten.",
    level: "COMMERCIAL_INTENT",
    detected: true,
  },
  {
    name: "Aannemer meer offerteaanvragen",
    text: "Wij zijn aannemer en willen meer offerteaanvragen binnenkrijgen.",
    level: "COMMERCIAL_INTENT",
    detected: true,
  },
  {
    name: "Coach meer klanten",
    text: "Ik ben coach en wil meer klanten binnenhalen.",
    level: "COMMERCIAL_INTENT",
    detected: true,
  },
  {
    name: "SaaS meer demo's",
    text: "Wij hebben een SaaS-bedrijf en willen meer demo's aanvragen.",
    level: "COMMERCIAL_INTENT",
    detected: true,
  },
  {
    name: "Reisbureau meer boekingen",
    text: "Wij hebben een reisbureau en willen meer boekingen genereren.",
    level: "COMMERCIAL_INTENT",
    detected: true,
  },
  {
    name: "Leadopvolging automatiseren",
    text: "Wij willen onze aanvragen automatisch opvolgen en meer klanten binnenhalen.",
    level: "HIGH_COMMERCIAL_INTENT",
    detected: true,
  },
  {
    name: "Afspraak",
    text: "Dit klinkt interessant. Ik wil graag een afspraak maken.",
    level: "HIGH_COMMERCIAL_INTENT",
    detected: true,
  },
  {
    name: "Kennismaking",
    text: "Ik wil graag een kennismaking inplannen.",
    level: "HIGH_COMMERCIAL_INTENT",
    detected: true,
  },
  {
    name: "Offerte",
    text: "Kunnen jullie hiervoor een offerte maken?",
    level: "COMMERCIAL_INTENT",
    detected: true,
  },
  {
    name: "Prijsinformatie",
    text: "Wat kost een AI-assistent voor mijn bedrijf?",
    level: "COMMERCIAL_INTENT",
    detected: true,
  },
  {
    name: "AI-assistent project",
    text: "Kunnen jullie voor mijn bedrijf een AI-assistent bouwen?",
    level: "COMMERCIAL_INTENT",
    detected: true,
  },
  {
    name: "Contactgegevens",
    text: "Mijn e-mailadres is test@example.com, neem maar contact op.",
    level: "HIGH_COMMERCIAL_INTENT",
    detected: true,
  },
  {
    name: "Alleen branchecontext",
    text: "Ik heb een bedrijf in de bouw.",
    level: "INFORMATIONAL",
    detected: false,
  },
  {
    name: "Alleen bedrijf",
    text: "Ik heb een bedrijf.",
    level: "INFORMATIONAL",
    detected: false,
  },
];

function classify(text) {
  const normalized = text.toLowerCase();

  /*
   * HIGH INTENT
   */

  const highIntent =
    /\bafspraak maken\b/i.test(normalized) ||
    /\bafspraak plannen\b/i.test(normalized) ||
    /\bafspraak inplannen\b/i.test(normalized) ||
    /\bkennismaking\b/i.test(normalized) ||
    /\bkennismaken\b/i.test(normalized) ||
    /\bgesprek inplannen\b/i.test(normalized) ||
    /\bgesprek plannen\b/i.test(normalized) ||
    /\bdemo aanvragen\b/i.test(normalized) ||
    /\bdemo plannen\b/i.test(normalized) ||
    /\bmijn e[- ]?mail\b/i.test(normalized) ||
    /\bmijn e[- ]?mailadres\b/i.test(normalized) ||
    /\be[- ]?mailadres\b/i.test(normalized) ||
    /\bmail me\b/i.test(normalized) ||
    /\bbel me\b/i.test(normalized) ||
    /\bneem contact op\b/i.test(normalized) ||
    /\bcontact opnemen\b/i.test(normalized) ||
    /@[a-z0-9.-]+\.[a-z]{2,}\b/i.test(normalized);

  if (highIntent) {
    return {
      level: "HIGH_COMMERCIAL_INTENT",
      detected: true,
    };
  }

  /*
   * COMMERCIAL GOALS
   */

  const commercialGoal =
    /\bmeer klanten\b/i.test(normalized) ||
    /\bmeer leads\b/i.test(normalized) ||
    /\bmeer aanvragen\b/i.test(normalized) ||
    /\bmeer verkopen\b/i.test(normalized) ||
    /\bmeer omzet\b/i.test(normalized) ||
    /\bmeer boekingen\b/i.test(normalized) ||
    /\bmeer reserveringen\b/i.test(normalized) ||
    /\bmeer afspraken\b/i.test(normalized) ||
    /\bmeer demo'?s\b/i.test(normalized) ||
    /\bmeer offerteaanvragen\b/i.test(normalized) ||
    /\bmeer offerte aanvragen\b/i.test(normalized) ||
    /\bklanten binnenhalen\b/i.test(normalized) ||
    /\bklanten werven\b/i.test(normalized) ||
    /\bleads genereren\b/i.test(normalized) ||
    /\bleads krijgen\b/i.test(normalized) ||
    /\bleads binnenhalen\b/i.test(normalized) ||
    /\bverkoop verhogen\b/i.test(normalized) ||
    /\bverkopen verhogen\b/i.test(normalized) ||
    /\bconversie verhogen\b/i.test(normalized) ||
    /\bconversie verbeteren\b/i.test(normalized) ||
    /\baanvragen genereren\b/i.test(normalized) ||
    /\bboekingen genereren\b/i.test(normalized) ||

    /*
     * "meer kleding verkopen"
     * "meer fietsen verkopen"
     * "meer auto's verkopen"
     * "meer producten verkopen"
     */
    /\bmeer\s+\w+(?:\s+\w+){0,2}\s+verkopen\b/i.test(normalized) ||

    /\bproducten verkopen\b/i.test(normalized) ||
    /\bkleding verkopen\b/i.test(normalized) ||
    /\bfietsen verkopen\b/i.test(normalized);

  const automation =
    /\bautomatiseren\b/i.test(normalized) ||
    /\bautomatisering\b/i.test(normalized) ||
    /\bautomatisch opvolgen\b/i.test(normalized) ||
    /\bautomatische opvolging\b/i.test(normalized) ||
    /\bleadopvolging\b/i.test(normalized) ||
    /\blead opvolging\b/i.test(normalized) ||
    /\baanvragen opvolgen\b/i.test(normalized) ||
    /\bklanten opvolgen\b/i.test(normalized) ||
    /\bfollow[- ]?up\b/i.test(normalized) ||
    /\bworkflow automatiseren\b/i.test(normalized) ||
    /\bprocessen automatiseren\b/i.test(normalized);

  /*
   * AUTOMATION + COMMERCIAL GOAL
   * = HIGH
   */

  if (automation && commercialGoal) {
    return {
      level: "HIGH_COMMERCIAL_INTENT",
      detected: true,
    };
  }

  /*
   * COMMERCIAL
   */

  if (commercialGoal || automation) {
    return {
      level: "COMMERCIAL_INTENT",
      detected: true,
    };
  }

  /*
   * PROJECT / SOLUTION
   */

  const project =
    /\bofferte\b/i.test(normalized) ||
    /\bprijsopgave\b/i.test(normalized) ||
    /\bwat kost\b/i.test(normalized) ||
    /\bprijs\b/i.test(normalized) ||
    /\bkosten\b/i.test(normalized) ||
    /\bai[- ]?assistent\b/i.test(normalized) ||
    /\bchatbot\b/i.test(normalized) ||
    /\bai oplossing\b/i.test(normalized) ||
    /\bai-oplossing\b/i.test(normalized) ||
    /\bai systeem\b/i.test(normalized) ||
    /\bai-systeem\b/i.test(normalized) ||
    /\blead generatie\b/i.test(normalized) ||
    /\bleadgeneratie\b/i.test(normalized) ||
    /\bleadopvang\b/i.test(normalized) ||
    /\bleadkwalificatie\b/i.test(normalized) ||
    /\bcrm koppeling\b/i.test(normalized) ||
    /\bcrm-koppeling\b/i.test(normalized);

  if (project) {
    return {
      level: "COMMERCIAL_INTENT",
      detected: true,
    };
  }

  /*
   * BUSINESS CONTEXT ALLEEN
   */

  const businessContext =
    /\bik heb een bedrijf\b/i.test(normalized) ||
    /\bwij hebben een bedrijf\b/i.test(normalized) ||
    /\bwe hebben een bedrijf\b/i.test(normalized) ||
    /\bmijn bedrijf\b/i.test(normalized) ||
    /\bons bedrijf\b/i.test(normalized) ||
    /\bonze onderneming\b/i.test(normalized) ||
    /\bmijn webshop\b/i.test(normalized) ||
    /\bonze webshop\b/i.test(normalized) ||
    /\bmijn winkel\b/i.test(normalized) ||
    /\bonze winkel\b/i.test(normalized) ||
    /\bmijn zaak\b/i.test(normalized) ||
    /\bonze zaak\b/i.test(normalized);

  if (businessContext) {
    return {
      level: "INFORMATIONAL",
      detected: false,
    };
  }

  return {
    level: "BUSINESS_INTEREST",
    detected: false,
  };
}

let failed = 0;

console.log("==========================================");
console.log("AIVaultsAI Commercial Intent Classifier");
console.log("==========================================\n");

for (const test of tests) {
  const result = classify(test.text);

  const passed =
    result.level === test.level &&
    result.detected === test.detected;

  console.log(
    `${passed ? "PASS" : "FAIL"} | ${test.name}`,
  );

  console.log(`  level:    ${result.level}`);
  console.log(`  detected: ${result.detected}`);

  if (!passed) {
    console.log(`  expected level:    ${test.level}`);
    console.log(`  expected detected: ${test.detected}`);
  }

  console.log("");
  
  if (!passed) {
    failed++;
  }
}

console.log("==========================================");

if (failed > 0) {
  console.error(
    `${failed} commercial intent test(s) failed.`,
  );

  process.exit(1);
}

console.log("All commercial intent tests passed.");