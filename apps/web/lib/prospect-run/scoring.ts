import type { ProspectIntelligence, PropensityScore, SalesRoute } from "./types.ts";

function clamp(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * Scores opportunity from separately inspectable components. Uncertainty is
 * a penalty, so an absent CRM/website signal can never inflate a prospect.
 */
export function scoreProspect(intelligence: ProspectIntelligence): PropensityScore {
  const opportunity = clamp(intelligence.commercialOpportunity);
  const evidence = clamp(intelligence.evidenceBaseline);
  const uncertainty = clamp(intelligence.uncertainty);
  const uncertaintyPenalty = Math.round(uncertainty * 0.2);
  const total = clamp(opportunity * 0.55 + evidence * 0.45 - uncertaintyPenalty);

  return {
    total,
    commercialOpportunity: opportunity,
    evidenceBaseline: evidence,
    uncertaintyPenalty,
    rationale: `Opportunity ${opportunity}/100; evidence ${evidence}/100; uncertainty penalty ${uncertaintyPenalty}.`,
  };
}

export function matchSalesRoute(intelligence: ProspectIntelligence): SalesRoute {
  const text = [...intelligence.pains, ...intelligence.evidence].join(" ").toLowerCase();
  if (/gdpr|privacy|compliance|audit|governance/.test(text)) return "HITL_COMPLIANCE";
  if (/seat|saas|api cost|licen[cs]|cloud cost|token/.test(text)) return "BYOK_COST_REDUCTION";
  return "SOVEREIGN_LOCAL_AI";
}
