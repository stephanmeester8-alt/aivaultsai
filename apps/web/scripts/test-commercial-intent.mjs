import {
  detectCommercialIntent,
} from "../lib/customer-zero/commercial-intent.ts";

const INTENT_LEVELS = {
  INFORMATIONAL: "INFORMATIONAL",
  BUSINESS_INTEREST: "BUSINESS_INTEREST",
  COMMERCIAL_INTENT: "COMMERCIAL_INTENT",
  HIGH_COMMERCIAL_INTENT: "HIGH_COMMERCIAL_INTENT",
};

const tests = [
  {
    name: "Algemene informatie",
    messages: [
      {
        role: "user",
        content: "Wat kunnen jullie met AI?",
      },
    ],
    expectedLevel: INTENT_LEVELS.INFORMATIONAL,
    expectedDetected: false,
  },

  {
    name: "Webshop informatie",
    messages: [
      {
        role: "user",
        content:
          "Ik heb een webshop. Wat kunnen jullie met AI?",
      },
    ],
    expectedLevel: INTENT_LEVELS.INFORMATIONAL,
    expectedDetected: false,
  },

  {
    name: "Webshop meer verkopen",
    messages: [
      {
        role: "user",
        content:
          "Ik heb een online shop en ik wil meer kleding verkopen.",
      },
    ],
    expectedLevel: INTENT_LEVELS.COMMERCIAL_INTENT,
    expectedDetected: true,
  },

  {
    name: "Fietsenwinkel meer verkopen",
    messages: [
      {
        role: "user",
        content:
          "Ik heb een fietsenwinkel en ik wil meer fietsen verkopen.",
      },
    ],
    expectedLevel: INTENT_LEVELS.COMMERCIAL_INTENT,
    expectedDetected: true,
  },

  {
    name: "Fietsenwinkel meer leads",
    messages: [
      {
        role: "user",
        content:
          "Ik heb een fietsenwinkel en ik wil meer leads krijgen.",
      },
    ],
    expectedLevel: INTENT_LEVELS.COMMERCIAL_INTENT,
    expectedDetected: true,
  },

  {
    name: "Restaurant meer reserveringen",
    messages: [
      {
        role: "user",
        content:
          "Wij hebben een restaurant en willen meer reserveringen.",
      },
    ],
    expectedLevel: INTENT_LEVELS.COMMERCIAL_INTENT,
    expectedDetected: true,
  },

  {
    name: "Makelaar meer aanvragen",
    messages: [
      {
        role: "user",
        content:
          "Ik ben makelaar en wil meer aanvragen van potentiële klanten.",
      },
    ],
    expectedLevel: INTENT_LEVELS.COMMERCIAL_INTENT,
    expectedDetected: true,
  },

  {
    name: "Aannemer meer offerteaanvragen",
    messages: [
      {
        role: "user",
        content:
          "Wij zijn aannemer en willen meer offerteaanvragen binnenkrijgen.",
      },
    ],
    expectedLevel: INTENT_LEVELS.COMMERCIAL_INTENT,
    expectedDetected: true,
  },

  {
    name: "Coach meer klanten",
    messages: [
      {
        role: "user",
        content:
          "Ik ben coach en wil meer klanten binnenhalen.",
      },
    ],
    expectedLevel: INTENT_LEVELS.COMMERCIAL_INTENT,
    expectedDetected: true,
  },

  {
    name: "SaaS meer demo's",
    messages: [
      {
        role: "user",
        content:
          "Wij hebben een SaaS-bedrijf en willen meer demo's aanvragen.",
      },
    ],
    expectedLevel: INTENT_LEVELS.COMMERCIAL_INTENT,
    expectedDetected: true,
  },

  {
    name: "Reisbureau meer boekingen",
    messages: [
      {
        role: "user",
        content:
          "Wij hebben een reisbureau en willen meer boekingen genereren.",
      },
    ],
    expectedLevel: INTENT_LEVELS.COMMERCIAL_INTENT,
    expectedDetected: true,
  },

  {
    name: "Leadopvolging automatiseren",
    messages: [
      {
        role: "user",
        content:
          "Wij willen onze aanvragen automatisch opvolgen en meer klanten binnenhalen.",
      },
    ],
    expectedLevel: INTENT_LEVELS.HIGH_COMMERCIAL_INTENT,
    expectedDetected: true,
  },

  {
    name: "Afspraak",
    messages: [
      {
        role: "user",
        content:
          "Dit klinkt interessant. Ik wil graag een afspraak maken.",
      },
    ],
    expectedLevel: INTENT_LEVELS.HIGH_COMMERCIAL_INTENT,
    expectedDetected: true,
  },

  {
    name: "Kennismaking",
    messages: [
      {
        role: "user",
        content:
          "Ik wil graag een kennismaking inplannen.",
      },
    ],
    expectedLevel: INTENT_LEVELS.HIGH_COMMERCIAL_INTENT,
    expectedDetected: true,
  },

  {
    name: "Offerte",
    messages: [
      {
        role: "user",
        content:
          "Kunnen jullie hiervoor een offerte maken?",
      },
    ],
    expectedLevel: INTENT_LEVELS.COMMERCIAL_INTENT,
    expectedDetected: true,
  },

  {
    name: "Prijsinformatie",
    messages: [
      {
        role: "user",
        content:
          "Wat kost een AI-assistent voor mijn bedrijf?",
      },
    ],
    expectedLevel: INTENT_LEVELS.COMMERCIAL_INTENT,
    expectedDetected: true,
  },

  {
    name: "AI-assistent project",
    messages: [
      {
        role: "user",
        content:
          "Kunnen jullie voor mijn bedrijf een AI-assistent bouwen?",
      },
    ],
    expectedLevel: INTENT_LEVELS.COMMERCIAL_INTENT,
    expectedDetected: true,
  },

  {
    name: "Contactgegevens",
    messages: [
      {
        role: "user",
        content:
          "Mijn e-mailadres is test@example.com, neem maar contact op.",
      },
    ],
    expectedLevel: INTENT_LEVELS.HIGH_COMMERCIAL_INTENT,
    expectedDetected: true,
  },

  {
    name: "Alleen branchecontext",
    messages: [
      {
        role: "user",
        content:
          "Ik heb een bedrijf in de bouw.",
      },
    ],
    expectedLevel: INTENT_LEVELS.INFORMATIONAL,
    expectedDetected: false,
  },

  {
    name: "Alleen bedrijf",
    messages: [
      {
        role: "user",
        content:
          "Ik heb een bedrijf.",
      },
    ],
    expectedLevel: INTENT_LEVELS.INFORMATIONAL,
    expectedDetected: false,
  },
];

let failed = 0;

console.log("==========================================");
console.log("AIVaultsAI Commercial Intent Classifier");
console.log("==========================================\n");

for (const test of tests) {
  const result = detectCommercialIntent(test.messages);

  const levelPassed =
    result.level === test.expectedLevel;

  const detectionPassed =
    result.detected === test.expectedDetected;

  const passed =
    levelPassed &&
    detectionPassed;

  console.log(
    `${passed ? "PASS" : "FAIL"} | ${test.name}`,
  );

  console.log(
    `  level:    ${result.level}`,
  );

  console.log(
    `  detected: ${result.detected}`,
  );

  console.log(
    `  score:    ${result.score}`,
  );

  if (!passed) {
    console.log(
      `  expected level:    ${test.expectedLevel}`,
    );

    console.log(
      `  expected detected: ${test.expectedDetected}`,
    );

    console.log(
      `  reasons:`,
      result.reasons,
    );

    failed++;
  }

  console.log("");
}

console.log("==========================================");

if (failed > 0) {
  console.error(
    `${failed} commercial intent test(s) failed.`,
  );

  process.exit(1);
}

console.log(
  "All commercial intent tests passed.",
);