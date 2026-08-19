import {
  CONTACT_EMAIL,
  FOOTER_LINKS,
  LINKEDIN_URL,
  SITE_DOMAIN,
  SITE_NAME,
} from "@/lib/site";
import { Container } from "./container";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-canvas">
      <Container className="flex flex-col gap-8 py-12 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium tracking-tight">{SITE_NAME}</p>

          <p className="mt-1 text-sm text-mute">
            AI-automatisering voor het MKB
          </p>

          <p className="mt-4 font-mono text-xs tracking-wide text-faint">
            {SITE_DOMAIN}
          </p>

          <div className="mt-5 flex flex-col gap-2">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-sm text-mute no-underline hover:text-ink"
            >
              {CONTACT_EMAIL}
            </a>

            <a
              href={LINKEDIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-mute no-underline hover:text-ink"
            >
              LinkedIn
            </a>
          </div>
        </div>

        <nav aria-label="Footer">
          <ul className="flex flex-col gap-2 sm:items-end">
            {FOOTER_LINKS.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="text-sm text-mute no-underline hover:text-ink"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </footer>
  );
}