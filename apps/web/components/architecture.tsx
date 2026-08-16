import { Container } from "./container";
import { Pipeline } from "./pipeline";
import { SectionHeading } from "./section-heading";
import { StatusBadge } from "./status-badge";

const STAGES = [
  { label: "User", detail: "A person initiates work. Not an autonomous loop.", status: "built" as const },
  { label: "Task", detail: "Lifecycle: backlog through done or failed.", status: "built" as const },
  { label: "Orchestrator", detail: "Coordinates engines. Stops before live execution.", status: "built" as const },
  { label: "Agent", detail: "Five specialist definitions and an in-memory registry.", status: "built" as const },
  { label: "Policy", detail: "Pure authorization. ALLOW is not execution.", status: "built" as const },
  { label: "Approval", detail: "Human records for high-risk and critical actions.", status: "built" as const },
  {
    label: "Execution gate",
    detail: "The only future execution boundary. Adapters are not implemented.",
    status: "in-development" as const,
  },
  { label: "Tools", detail: "Browser, filesystem, terminal, HTTP, and MCP remain disabled.", status: "planned" as const },
  { label: "Evidence", detail: "Append-only records with typed claims and provenance.", status: "built" as const },
  { label: "Handoff", detail: "Structured transfer between agents. Not a chat message.", status: "built" as const },
];

export function Architecture() {
  return (
    <section
      id="architecture"
      className="scroll-mt-24 border-b border-line py-20 sm:py-24"
      aria-labelledby="architecture-heading"
    >
      <Container>
        <SectionHeading
          id="architecture-heading"
          index="06"
          eyebrow="Architecture"
          title="One path. Explicit status."
        >
          The public website is presentation-only. It does not import the agent-core package and does not
          run agents. Labels below describe the designed system, not a live production runtime.
        </SectionHeading>
        <div className="mt-10 flex flex-wrap gap-2" aria-label="Status legend">
          <StatusBadge status="built" />
          <StatusBadge status="in-development" />
          <StatusBadge status="planned" />
        </div>
        <div className="mt-8 border border-line bg-panel p-6 sm:p-8">
          <Pipeline labelledBy="architecture-heading" stages={STAGES} />
        </div>
      </Container>
    </section>
  );
}
