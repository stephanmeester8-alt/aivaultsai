import { Container } from "./container";
import { SectionHeading } from "./section-heading";

const CONTROLS = [
  {
    title: "Permission boundaries",
    copy: "Agents receive only the permissions their role allows. Missing or unknown permissions fail closed.",
  },
  {
    title: "Policy decisions",
    copy: "ALLOW authorizes. It does not execute. DENY and APPROVAL_REQUIRED stop the path.",
  },
  {
    title: "Human approval",
    copy: "High-risk and critical actions require a human. Approval is scoped to task, action, and risk — not a standing grant.",
  },
  {
    title: "Evidence",
    copy: "What happened is recorded separately from what was inferred. Fabricated execution evidence is rejected.",
  },
  {
    title: "Auditability",
    copy: "The intended path is agent → policy → permission check → tool → result → evidence. No silent bypass.",
  },
];

export function Controlled() {
  return (
    <section className="border-b border-line py-20 sm:py-24" aria-labelledby="control-heading">
      <Container>
        <SectionHeading id="control-heading" index="04" eyebrow="Control" title="Autonomy needs boundaries.">
          Agents should not receive unrestricted access to browsers, terminals, filesystems, or external
          accounts. AIVaultsAI treats execution as a gated capability — not a default.
        </SectionHeading>
        <ol className="mt-12 grid gap-6 md:grid-cols-2">
          {CONTROLS.map((item, index) => (
            <li key={item.title} className="border-t border-line pt-5">
              <p className="font-mono text-[11px] tracking-[0.16em] text-faint">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-2 text-lg font-medium tracking-tight text-ink">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mute">{item.copy}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
