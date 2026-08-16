import { Container } from "./container";
import { Pipeline } from "./pipeline";
import { SectionHeading } from "./section-heading";

const STAGES = [
  { label: "Task", detail: "Work is created, classified, and assigned." },
  { label: "Agent", detail: "A specialist plans within its role. It does not execute tools directly." },
  { label: "Policy", detail: "Permissions and risk are evaluated. Default deny." },
  { label: "Approval when required", detail: "High-risk and critical actions wait for a human decision." },
  { label: "Controlled execution", detail: "The execution gate is the only future path to tools. It is not live." },
  { label: "Evidence", detail: "Results are recorded with source, provenance, and confidence." },
  { label: "Handoff", detail: "Completed work, findings, and next action transfer as a structured artifact." },
  { label: "Next agent", detail: "The orchestrator continues the lifecycle. Completion is not implied by a chat reply." },
] as const;

export function HowItWorks() {
  return (
    <section className="border-b border-line py-20 sm:py-24" aria-labelledby="how-heading">
      <Container className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
        <SectionHeading id="how-heading" index="03" eyebrow="Lifecycle" title="How work is supposed to move.">
          This is the designed operating path. Authorization is required before execution. Execution
          itself is not enabled on the public website, and is not a production capability yet.
        </SectionHeading>
        <div className="border border-line bg-panel p-6 sm:p-8">
          <Pipeline labelledBy="how-heading" stages={STAGES} />
        </div>
      </Container>
    </section>
  );
}
