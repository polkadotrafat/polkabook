import { AppShell } from "@/components/layout/AppShell";
import { Section } from "@/components/layout/Section";
import { PairTable } from "@/components/markets/PairTable";
import { listMarkets } from "@/lib/data/polkabook";

export default async function MarketsPage() {
  const markets = await listMarkets();

  return (
    <AppShell>
      <Section
        eyebrow="Markets"
        title="Pair directory"
        description="Live deployed markets on Paseo, keyed by their on-chain order book address."
      >
        <PairTable markets={markets} />
      </Section>
    </AppShell>
  );
}
