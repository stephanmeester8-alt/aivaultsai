import { Agents } from "@/components/agents";
import { Architecture } from "@/components/architecture";
import { CommercialContact } from "@/components/commercial-contact";
import { Controlled } from "@/components/controlled";
import { Evidence } from "@/components/evidence";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { Pricing } from "@/components/pricing";
import { Problem } from "@/components/problem";
import { Roadmap } from "@/components/roadmap";

export default function Home() {
  return (
    <main id="main">
      <Hero />
      <Problem />
      <Pricing />
      <HowItWorks />
      <Agents />
      <Controlled />
      <Evidence />
      <Architecture />
      <Roadmap />
      <CommercialContact />
    </main>
  );
}
