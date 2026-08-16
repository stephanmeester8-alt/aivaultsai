import { Agents } from "@/components/agents";
import { Architecture } from "@/components/architecture";
import { Controlled } from "@/components/controlled";
import { EarlyAccess } from "@/components/early-access";
import { Evidence } from "@/components/evidence";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { Problem } from "@/components/problem";
import { Roadmap } from "@/components/roadmap";

export default function Home() {
  return (
    <main id="main">
      <Hero />
      <Problem />
      <Agents />
      <HowItWorks />
      <Controlled />
      <Evidence />
      <Architecture />
      <Roadmap />
      <EarlyAccess />
    </main>
  );
}
