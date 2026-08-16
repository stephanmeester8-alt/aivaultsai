import { Container } from "./container";
import { SectionHeading } from "./section-heading";
import { StatusBadge, type CapabilityStatus } from "./status-badge";

const COLUMNS: {
  title: string;
  status: CapabilityStatus;
  items: readonly string[];
}[] = [
  {
    title: "Foundation",
    status: "built",
    items: [
      "Agent contracts",
      "Agent registry",
      "Task engine",
      "Policy engine",
      "Approval engine",
      "Handoff engine",
      "Evidence store",
      "Orchestrator",
    ],
  },
  {
    title: "Next",
    status: "in-development",
    items: [
      "Execution gate",
      "Browser execution",
      "Controlled web research",
      "Hermes integration",
    ],
  },
  {
    title: "Future",
    status: "planned",
    items: [
      "Persistent agent runtime",
      "Multi-agent autonomous workflows",
      "Enterprise integrations",
      "Advanced analytics",
      "Production platform",
    ],
  },
];

const NEXT_ITEM_STATUS: Record<string, CapabilityStatus> = {
  "Execution gate": "in-development",
  "Browser execution": "planned",
  "Controlled web research": "planned",
  "Hermes integration": "planned",
};

export function Roadmap() {
  return (
    <section id="roadmap" className="scroll-mt-24 border-b border-line py-20 sm:py-24" aria-labelledby="roadmap-heading">
      <Container>
        <SectionHeading id="roadmap-heading" index="07" eyebrow="Roadmap" title="Built where it is built.">
          Foundation software exists as typed contracts and in-memory engines. The items under Next and
          Future are not production features. Browser execution and Hermes are not installed.
        </SectionHeading>
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {COLUMNS.map((column) => (
            <article key={column.title} className="border border-line bg-panel p-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-mono text-xs tracking-[0.16em] text-ink uppercase">{column.title}</h3>
                <StatusBadge status={column.status} />
              </div>
              <ul className="mt-6 space-y-3">
                {column.items.map((item) => (
                  <li key={item} className="flex items-start justify-between gap-3 border-b border-line pb-3 last:border-0 last:pb-0">
                    <span className="text-sm text-mute">{item}</span>
                    {column.title === "Next" ? (
                      <StatusBadge status={NEXT_ITEM_STATUS[item] ?? "planned"} />
                    ) : null}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
