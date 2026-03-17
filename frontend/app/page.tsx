import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { Section } from "@/components/layout/Section";
import { PairTable } from "@/components/markets/PairTable";
import { StatusBadge } from "@/components/system/StatusBadge";
import { listMarkets } from "@/lib/data/polkabook";

export default async function Home() {
  const markets = await listMarkets();
  const featured = markets.slice(0, 3);

  return (
    <AppShell>
      <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <StatusBadge tone="accent">Hybrid CLOB on PolkaVM</StatusBadge>
          <div className="space-y-4">
            <p className="max-w-2xl text-sm font-semibold uppercase tracking-[0.28em] text-[var(--ink-soft)]">
              PolkaBook
            </p>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[0.95] tracking-[-0.04em] text-[var(--ink-strong)] sm:text-6xl">
              A bounded on-chain order book built for predictable matching.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-[var(--ink-soft)]">
              Solidity persists custody and queue state. A Rust kernel compiled
              for PolkaVM handles bounded price-time-priority matching.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="button-primary" href="/markets">
              View Markets
            </Link>
            <Link className="button-secondary" href="/portfolio">
              Open Portfolio
            </Link>
          </div>
        </div>

        <Section
          eyebrow="System"
          title="Execution profile"
          description="The frontend is organized around pair discovery, top-of-book reads, quote previews, and bounded frontier visualization."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="metric-card">
              <span className="metric-label">Pairs</span>
              <span className="metric-value">{markets.length}</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Matcher depth</span>
              <span className="metric-value">20 x 20</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Matcher model</span>
              <span className="metric-value">Stateless</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Book model</span>
              <span className="metric-value">Bucketed</span>
            </div>
          </div>
        </Section>
      </section>

      <Section
        eyebrow="Markets"
        title="Featured pairs"
        description="This screen reads the live deployed Paseo market configuration and current top-of-book state."
      >
        <PairTable markets={featured} />
      </Section>
    </AppShell>
  );
}
