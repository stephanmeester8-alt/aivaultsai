import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createEvidenceStore,
  isEvidenceStoreError,
  type Evidence,
  type EvidenceStoreError,
} from "../src/index.ts";

function baseEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    evidenceId: "ev_001",
    claim: "The vendor lists a starter plan on its pricing page",
    type: "COMPANY_CLAIM",
    source: "official website",
    sourceType: "web_page",
    supportingData: "Pricing page heading: Starter",
    counterEvidence: null,
    confidence: "MEDIUM",
    collectedAt: "2026-08-16T00:00:00.000Z",
    taskId: "task_001",
    agentId: "research_intelligence",
    ...overrides,
    provenance: {
      actor: "research_intelligence",
      toolId: null,
      capability: null,
      method: "manual_review",
      origin: "agent_research",
      executionOccurred: false,
      ...overrides.provenance,
    },
  };
}

function expectCode(error: unknown, code: EvidenceStoreError["code"]): void {
  assert.equal(isEvidenceStoreError(error), true);
  assert.equal((error as EvidenceStoreError).code, code);
}

test("create valid evidence", () => {
  const store = createEvidenceStore();
  const created = store.createEvidence(baseEvidence());
  assert.equal(created.evidenceId, "ev_001");
  assert.equal(store.hasEvidence("ev_001"), true);
});

test("retrieve evidence", () => {
  const store = createEvidenceStore();
  store.createEvidence(baseEvidence());
  assert.equal(store.getEvidence("ev_001").claim.includes("starter plan"), true);
});

test("list evidence", () => {
  const store = createEvidenceStore();
  store.createEvidence(baseEvidence());
  store.createEvidence(baseEvidence({ evidenceId: "ev_002", type: "INFERENCE" }));
  assert.equal(store.listEvidence().length, 2);
});

test("unknown evidence ID", () => {
  const store = createEvidenceStore();
  assert.throws(
    () => store.getEvidence("missing"),
    (error: unknown) => {
      expectCode(error, "EVIDENCE_NOT_FOUND");
      return true;
    },
  );
});

test("duplicate evidence ID", () => {
  const store = createEvidenceStore();
  store.createEvidence(baseEvidence());
  assert.throws(
    () => store.createEvidence(baseEvidence()),
    (error: unknown) => {
      expectCode(error, "EVIDENCE_ALREADY_EXISTS");
      return true;
    },
  );
});

test("empty claim", () => {
  const store = createEvidenceStore();
  assert.throws(
    () => store.createEvidence(baseEvidence({ claim: "  " })),
    (error: unknown) => {
      expectCode(error, "INVALID_EVIDENCE");
      return true;
    },
  );
});

test("empty source", () => {
  const store = createEvidenceStore();
  assert.throws(
    () => store.createEvidence(baseEvidence({ source: "" })),
    (error: unknown) => {
      expectCode(error, "INVALID_EVIDENCE");
      return true;
    },
  );
});

test("invalid evidence type", () => {
  const store = createEvidenceStore();
  assert.throws(
    () => store.createEvidence(baseEvidence({ type: "TRUTH" as Evidence["type"] })),
    (error: unknown) => {
      expectCode(error, "INVALID_EVIDENCE");
      return true;
    },
  );
});

test("invalid confidence", () => {
  const store = createEvidenceStore();
  assert.throws(
    () => store.createEvidence(baseEvidence({ confidence: "CERTAIN" as Evidence["confidence"] })),
    (error: unknown) => {
      expectCode(error, "INVALID_EVIDENCE");
      return true;
    },
  );
});

test("invalid timestamp", () => {
  const store = createEvidenceStore();
  assert.throws(
    () => store.createEvidence(baseEvidence({ collectedAt: "not-a-date" })),
    (error: unknown) => {
      expectCode(error, "INVALID_EVIDENCE");
      return true;
    },
  );
});

test("evidence type remains unchanged", () => {
  const store = createEvidenceStore();
  const created = store.createEvidence(baseEvidence({ type: "ASSUMPTION", confidence: "LOW" }));
  assert.equal(store.getEvidence(created.evidenceId).type, "ASSUMPTION");
});

test("INFERENCE is never upgraded to FACT", () => {
  const store = createEvidenceStore();
  const created = store.createEvidence(baseEvidence({ type: "INFERENCE", confidence: "HIGH" }));
  assert.equal(created.type, "INFERENCE");
  assert.notEqual(created.type, "FACT");
});

test("HYPOTHESIS is never upgraded to FACT", () => {
  const store = createEvidenceStore();
  const created = store.createEvidence(
    baseEvidence({ evidenceId: "ev_hyp", type: "HYPOTHESIS", confidence: "MEDIUM" }),
  );
  assert.equal(created.type, "HYPOTHESIS");
  assert.notEqual(store.getEvidence("ev_hyp").type, "FACT");
});

test("COMPANY_CLAIM is never upgraded to INDEPENDENTLY_VERIFIED", () => {
  const store = createEvidenceStore();
  const created = store.createEvidence(baseEvidence({ type: "COMPANY_CLAIM" }));
  assert.equal(created.type, "COMPANY_CLAIM");
  assert.notEqual(created.type, "INDEPENDENTLY_VERIFIED");
});

test("high confidence does not change evidence type", () => {
  const store = createEvidenceStore();
  const created = store.createEvidence(
    baseEvidence({ type: "INFERENCE", confidence: "HIGH", source: "independent article" }),
  );
  assert.equal(created.confidence, "HIGH");
  assert.equal(created.type, "INFERENCE");
});

test("evidence can reference a task", () => {
  const store = createEvidenceStore();
  const created = store.createEvidence(baseEvidence({ taskId: "task_001" }));
  assert.equal(created.taskId, "task_001");
});

test("evidence can reference an agent", () => {
  const store = createEvidenceStore();
  const created = store.createEvidence(baseEvidence({ agentId: "research_intelligence" }));
  assert.equal(created.agentId, "research_intelligence");
});

test("listByTask works", () => {
  const store = createEvidenceStore();
  store.createEvidence(baseEvidence({ evidenceId: "ev_a", taskId: "task_001" }));
  store.createEvidence(baseEvidence({ evidenceId: "ev_b", taskId: "task_002" }));
  assert.equal(store.listByTask("task_001").length, 1);
  assert.equal(store.listByTask("task_001")[0]?.evidenceId, "ev_a");
});

test("listByAgent works", () => {
  const store = createEvidenceStore();
  store.createEvidence(baseEvidence({ evidenceId: "ev_a", agentId: "research_intelligence" }));
  store.createEvidence(
    baseEvidence({ evidenceId: "ev_b", agentId: "product_ux", type: "INFERENCE" }),
  );
  assert.equal(store.listByAgent("product_ux").length, 1);
});

test("listByType works", () => {
  const store = createEvidenceStore();
  store.createEvidence(baseEvidence({ evidenceId: "ev_a", type: "FACT", source: "documentation" }));
  store.createEvidence(baseEvidence({ evidenceId: "ev_b", type: "INFERENCE" }));
  assert.equal(store.listByType("FACT").length, 1);
  assert.equal(store.listByType("INFERENCE").length, 1);
});

test("listByConfidence works", () => {
  const store = createEvidenceStore();
  store.createEvidence(baseEvidence({ evidenceId: "ev_a", confidence: "LOW" }));
  store.createEvidence(baseEvidence({ evidenceId: "ev_b", confidence: "HIGH", source: "documentation" }));
  assert.equal(store.listByConfidence("HIGH").length, 1);
});

test("returned evidence cannot mutate internal state", () => {
  const store = createEvidenceStore();
  store.createEvidence(baseEvidence());
  const copy = store.getEvidence("ev_001") as unknown as {
    claim: string;
    type: string;
    provenance: { method: string };
  };
  copy.claim = "mutated";
  copy.type = "FACT";
  copy.provenance.method = "hacked";
  const stored = store.getEvidence("ev_001");
  assert.equal(stored.claim, "The vendor lists a starter plan on its pricing page");
  assert.equal(stored.type, "COMPANY_CLAIM");
  assert.equal(stored.provenance.method, "manual_review");
});

test("execution claim without execution provenance is rejected or represented as non-execution evidence", () => {
  const store = createEvidenceStore();
  assert.throws(
    () =>
      store.createEvidence(
        baseEvidence({
          claim: "Browser opened website",
          type: "FACT",
          provenance: {
            actor: "research_intelligence",
            toolId: null,
            capability: null,
            method: "manual_review",
            origin: "agent_research",
            executionOccurred: false,
          },
        }),
      ),
    (error: unknown) => {
      expectCode(error, "INVALID_EVIDENCE");
      return true;
    },
  );
  const recorded = store.createEvidence(
    baseEvidence({
      evidenceId: "ev_non_exec",
      claim: "Browser opened website",
      type: "HYPOTHESIS",
      confidence: "LOW",
      provenance: {
        actor: "research_intelligence",
        toolId: null,
        capability: null,
        method: "unverified_report",
        origin: "user",
        executionOccurred: false,
      },
    }),
  );
  assert.equal(recorded.type, "HYPOTHESIS");
  assert.equal(recorded.provenance.executionOccurred, false);
});

test("browser provenance cannot be fabricated as actual browser execution", () => {
  const store = createEvidenceStore();
  assert.throws(
    () =>
      store.createEvidence(
        baseEvidence({
          claim: "Page title was collected from a live browser session",
          type: "FACT",
          provenance: {
            actor: "research_intelligence",
            toolId: "browser",
            capability: "WEB_READ",
            method: "web_read",
            origin: "browser",
            executionOccurred: true,
          },
        }),
      ),
    (error: unknown) => {
      expectCode(error, "INVALID_EVIDENCE");
      return true;
    },
  );
});
