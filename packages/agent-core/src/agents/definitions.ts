import type { AgentDefinition } from "./types.ts";

export const CTO_ARCHITECT: AgentDefinition = {
  id: "cto_architect",
  name: "CTO / AI Systems Architect",
  role: "Technical strategy and architecture owner",
  mission: "Own technical strategy and architecture.",
  description:
    "Owns technical strategy and architecture: what should be built and how it should be architected.",
  status: "ACTIVE",
  capabilities: ["ARCHITECTURE"],
  allowedTools: [],
  prohibitedTools: ["browser", "filesystem", "terminal", "http", "mcp"],
  allowedPermissions: [],
  prohibitedPermissions: [
    "WEB_SEARCH",
    "WEB_READ",
    "WEB_NAVIGATE",
    "WEB_CLICK",
    "WEB_TYPE",
    "WEB_DOWNLOAD",
    "WEB_UPLOAD",
    "FILESYSTEM_READ",
    "FILESYSTEM_WRITE",
    "TERMINAL_EXECUTE",
    "API_REQUEST",
    "MCP_EXECUTE",
  ],
  handoffTargets: [
    "research_intelligence",
    "product_ux",
    "principal_engineer",
    "growth_analytics",
  ],
  riskLevel: "MEDIUM",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
      objective: { type: "string" },
      inputs: {
        type: "object",
        properties: {
          problem: { type: "string" },
          constraints: { type: "object" },
          current_architecture: { type: ["object", "null"] },
          non_functional_requirements: { type: "object" },
        },
      },
      evidence_required: { type: "boolean" },
      risk_level: { type: "string" },
    },
  },
  outputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
      summary: { type: "string" },
      findings: { type: "array" },
      decisions: { type: "array" },
      evidence_ids: { type: "array" },
      risks: { type: "array" },
      open_questions: { type: "array" },
      recommended_next_action: { type: "string" },
    },
  },
};

export const RESEARCH_INTELLIGENCE: AgentDefinition = {
  id: "research_intelligence",
  name: "Research Intelligence",
  role: "External knowledge acquisition and verification",
  mission: "Acquire and verify external knowledge.",
  description:
    "Acquires and verifies external knowledge: what do we actually know and what evidence supports it.",
  status: "ACTIVE",
  capabilities: ["RESEARCH", "WEB_RESEARCH", "EVIDENCE_COLLECTION"],
  allowedTools: ["browser", "http"],
  prohibitedTools: ["filesystem", "terminal", "mcp"],
  allowedPermissions: ["WEB_SEARCH", "WEB_READ", "WEB_NAVIGATE", "API_REQUEST"],
  prohibitedPermissions: [
    "WEB_CLICK",
    "WEB_TYPE",
    "WEB_DOWNLOAD",
    "WEB_UPLOAD",
    "FILESYSTEM_WRITE",
    "TERMINAL_EXECUTE",
    "MCP_EXECUTE",
  ],
  handoffTargets: [
    "cto_architect",
    "product_ux",
    "principal_engineer",
    "growth_analytics",
  ],
  riskLevel: "MEDIUM",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
      objective: { type: "string" },
      inputs: {
        type: "object",
        properties: {
          research_question: { type: "string" },
          scope: { type: "object" },
          required_source_types: { type: "array" },
          known_claims: { type: "array" },
        },
      },
      evidence_required: { type: "boolean" },
      risk_level: { type: "string" },
    },
  },
  outputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
      summary: { type: "string" },
      findings: { type: "array" },
      decisions: { type: "array" },
      evidence_ids: { type: "array" },
      risks: { type: "array" },
      open_questions: { type: "array" },
      recommended_next_action: { type: "string" },
    },
  },
};

export const PRODUCT_UX: AgentDefinition = {
  id: "product_ux",
  name: "Product / UX",
  role: "Product and user-experience design",
  mission: "Translate customer problems into useful products.",
  description:
    "Designs products and user experiences: what should we build for the customer and why will they use it.",
  status: "ACTIVE",
  capabilities: ["PRODUCT_STRATEGY", "UX_DESIGN"],
  allowedTools: [],
  prohibitedTools: ["browser", "filesystem", "terminal", "http", "mcp"],
  allowedPermissions: [],
  prohibitedPermissions: [
    "WEB_CLICK",
    "WEB_TYPE",
    "WEB_DOWNLOAD",
    "WEB_UPLOAD",
    "FILESYSTEM_WRITE",
    "TERMINAL_EXECUTE",
    "API_REQUEST",
    "MCP_EXECUTE",
  ],
  handoffTargets: [
    "cto_architect",
    "research_intelligence",
    "principal_engineer",
    "growth_analytics",
  ],
  riskLevel: "MEDIUM",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
      objective: { type: "string" },
      inputs: {
        type: "object",
        properties: {
          customer_problem: { type: "string" },
          icp: { type: ["object", "null"] },
          constraints: { type: "object" },
          research_evidence_ids: { type: "array" },
        },
      },
      evidence_required: { type: "boolean" },
      risk_level: { type: "string" },
    },
  },
  outputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
      summary: { type: "string" },
      findings: { type: "array" },
      decisions: { type: "array" },
      evidence_ids: { type: "array" },
      risks: { type: "array" },
      open_questions: { type: "array" },
      recommended_next_action: { type: "string" },
    },
  },
};

export const PRINCIPAL_ENGINEER: AgentDefinition = {
  id: "principal_engineer",
  name: "Principal AI Full-Stack Engineer",
  role: "Production software implementation",
  mission: "Turn approved architecture and product requirements into production software.",
  description:
    "Implements production software: how do we implement this correctly, with evidence and tests.",
  status: "ACTIVE",
  capabilities: ["ENGINEERING", "CODE", "TESTING"],
  allowedTools: ["filesystem", "terminal"],
  prohibitedTools: ["browser", "http", "mcp"],
  allowedPermissions: ["FILESYSTEM_READ", "FILESYSTEM_WRITE", "TERMINAL_EXECUTE"],
  prohibitedPermissions: [
    "WEB_SEARCH",
    "WEB_READ",
    "WEB_NAVIGATE",
    "WEB_CLICK",
    "WEB_TYPE",
    "WEB_DOWNLOAD",
    "WEB_UPLOAD",
    "API_REQUEST",
    "MCP_EXECUTE",
  ],
  handoffTargets: [
    "cto_architect",
    "research_intelligence",
    "product_ux",
    "growth_analytics",
  ],
  riskLevel: "HIGH",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
      objective: { type: "string" },
      inputs: {
        type: "object",
        properties: {
          architecture_decision_ids: { type: "array" },
          requirements: { type: "object" },
          constraints: { type: "object" },
          authorized_scope: { type: "object" },
        },
      },
      evidence_required: { type: "boolean" },
      risk_level: { type: "string" },
    },
  },
  outputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
      summary: { type: "string" },
      findings: { type: "array" },
      decisions: { type: "array" },
      evidence_ids: { type: "array" },
      risks: { type: "array" },
      open_questions: { type: "array" },
      recommended_next_action: { type: "string" },
    },
  },
};

export const GROWTH_ANALYTICS: AgentDefinition = {
  id: "growth_analytics",
  name: "Growth / Analytics",
  role: "Growth measurement and improvement",
  mission: "Measure and improve business growth.",
  description:
    "Measures and improves business growth: what is working and how can we improve it.",
  status: "ACTIVE",
  capabilities: ["ANALYTICS", "SEO", "GROWTH"],
  allowedTools: ["browser"],
  prohibitedTools: ["filesystem", "terminal", "http", "mcp"],
  allowedPermissions: ["WEB_SEARCH", "WEB_READ"],
  prohibitedPermissions: [
    "WEB_NAVIGATE",
    "WEB_CLICK",
    "WEB_TYPE",
    "WEB_DOWNLOAD",
    "WEB_UPLOAD",
    "FILESYSTEM_WRITE",
    "TERMINAL_EXECUTE",
    "API_REQUEST",
    "MCP_EXECUTE",
  ],
  handoffTargets: [
    "cto_architect",
    "research_intelligence",
    "product_ux",
    "principal_engineer",
  ],
  riskLevel: "MEDIUM",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
      objective: { type: "string" },
      inputs: {
        type: "object",
        properties: {
          kpi_question: { type: "string" },
          metrics: { type: ["object", "null"] },
          experiment: { type: ["object", "null"] },
          research_evidence_ids: { type: "array" },
        },
      },
      evidence_required: { type: "boolean" },
      risk_level: { type: "string" },
    },
  },
  outputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
      summary: { type: "string" },
      findings: { type: "array" },
      decisions: { type: "array" },
      evidence_ids: { type: "array" },
      risks: { type: "array" },
      open_questions: { type: "array" },
      recommended_next_action: { type: "string" },
    },
  },
};

export const INITIAL_AGENTS: readonly AgentDefinition[] = [
  CTO_ARCHITECT,
  RESEARCH_INTELLIGENCE,
  PRODUCT_UX,
  PRINCIPAL_ENGINEER,
  GROWTH_ANALYTICS,
];
