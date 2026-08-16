import { AgentDiagram } from "./agent-diagram";
import { Container } from "./container";
import { SectionHeading } from "./section-heading";

const AGENTS = [
  {
    name: "CTO / AI Architect",
    question: "What should we build, and how should it be architected?",
  },
  {
    name: "Research Intelligence",
    question: "What do we actually know, and what evidence supports it?",
  },
  {
    name: "Product / UX",
    question: "What should we build for the customer, and why will they use it?",
  },
  {
    name: "Principal AI Engineer",
    question: "How do we implement this correctly?",
  },
  {
    name: "Growth / Analytics",
    question: "What is working, and how can we improve it?",
  },
];

export function Agents() {
  return (
    <section id="agents" className="scroll-mt-24 border-b border-line py-20 sm:py-24" aria-labelledby="agents-heading">
      <Container>
        <SectionHeading id="agents-heading" index="02" eyebrow="Agents" title="Five specialists. One orchestrator.">
          Each agent has a defined role, capabilities, and permission boundary. The orchestrator
          coordinates. Agents do not run tools on their own, and this site does not claim autonomous
          execution.
        </SectionHeading>
        <div className="mt-12 border border-line bg-panel p-4 sm:p-8">
          <AgentDiagram />
        </div>
        <ul className="mt-8 grid gap-4 md:grid-cols-2">
          {AGENTS.map((agent) => (
            <li key={agent.name} className="border border-line bg-canvas p-5">
              <p className="text-sm font-medium text-ink">{agent.name}</p>
              <p className="mt-2 text-sm leading-relaxed text-mute">{agent.question}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
