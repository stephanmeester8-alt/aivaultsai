import { NAV, SITE_NAME } from "@/lib/site";
import { Container } from "./container";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-canvas/85 backdrop-blur-md">
      <Container className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:py-0 sm:h-16">
        <div className="flex items-center justify-between gap-4">
          <a href="#top" className="flex items-center gap-2.5 text-ink no-underline">
            <span className="inline-flex h-7 w-7 items-center justify-center border border-gold/50 bg-gold-dim" aria-hidden="true">
              <span className="grid grid-cols-2 gap-0.5">
                <span className="h-1.5 w-1.5 bg-gold" />
                <span className="h-1.5 w-1.5 bg-gold/40" />
                <span className="h-1.5 w-1.5 bg-gold/40" />
                <span className="h-1.5 w-1.5 bg-gold" />
              </span>
            </span>
            <span className="text-sm font-medium tracking-tight">{SITE_NAME}</span>
          </a>
          <a
            href="#early-access"
            className="inline-flex items-center rounded-sm bg-ink px-3 py-1.5 text-xs font-medium text-canvas no-underline sm:hidden"
          >
            Early Access
          </a>
        </div>
        <nav aria-label="Primary" className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-1 sm:pb-0">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm text-mute no-underline transition-colors hover:text-ink"
            >
              {item.label}
            </a>
          ))}
          <a
            href="#early-access"
            className="ml-auto hidden items-center rounded-sm bg-ink px-3 py-1.5 text-xs font-medium text-canvas no-underline hover:bg-gold sm:inline-flex"
          >
            Early Access
          </a>
        </nav>
      </Container>
    </header>
  );
}
