import { Container } from "./container";
import { SectionHeading } from "./section-heading";

export function EarlyAccess() {
  return (
    <section
      id="early-access"
      className="scroll-mt-24 py-20 sm:py-24"
      aria-labelledby="access-heading"
    >
      <Container className="max-w-3xl">
        <SectionHeading id="access-heading" index="08" eyebrow="Early access" title="Join the AIVaultsAI early access list.">
          We are not collecting signups on this site yet. There is no form backend, mailing list, or
          configured contact address in the repository.
        </SectionHeading>
        <div className="mt-8 border border-line bg-panel p-6 sm:p-8">
          <button
            type="button"
            aria-disabled="true"
            aria-describedby="access-note"
            className="inline-flex cursor-not-allowed items-center justify-center rounded-sm border border-line bg-raised px-5 py-3 text-sm font-medium text-faint"
          >
            Request Access
          </button>
          <p id="access-note" className="mt-4 text-sm leading-relaxed text-mute">
            Placeholder control. Pressing it does not send a request. When a contact channel is
            configured, this section will be connected without adding a fake backend.
          </p>
        </div>
      </Container>
    </section>
  );
}
