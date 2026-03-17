import { notFound } from "next/navigation";

import { AppShell } from "@/components/layout/AppShell";
import { Section } from "@/components/layout/Section";
import { OrderBookLadder } from "@/components/orderbook/OrderBookLadder";
import { TopOfBookStrip } from "@/components/orderbook/TopOfBookStrip";
import { ConnectedVaultBalances } from "@/components/portfolio/ConnectedVaultBalances";
import { ConnectedWalletTokenBalances } from "@/components/portfolio/ConnectedWalletTokenBalances";
import { ConnectedOpenOrders } from "@/components/portfolio/ConnectedOpenOrders";
import { TradingPanel } from "@/components/trade/TradingPanel";
import { getMarketByAddress } from "@/lib/data/polkabook";

type MarketPageProps = {
  params: Promise<{ pairAddress: string }>;
};

export default async function MarketPage({ params }: MarketPageProps) {
  const { pairAddress } = await params;
  const market = await getMarketByAddress(pairAddress);

  if (!market) {
    notFound();
  }

  return (
    <AppShell>
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <TopOfBookStrip market={market} />
          <OrderBookLadder market={market} />
        </div>

        <div className="space-y-6">
          <TradingPanel market={market} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Section
          eyebrow="Portfolio"
          title="Wallet token balances"
          description="Live ERC-20 balances in the connected MetaMask wallet before deposit."
        >
          <ConnectedWalletTokenBalances
            baseSymbol={market.baseSymbol}
            quoteSymbol={market.quoteSymbol}
          />
        </Section>

        <Section
          eyebrow="Portfolio"
          title="Vault balances"
          description="Live vault balances for the connected MetaMask wallet."
        >
          <ConnectedVaultBalances
            baseSymbol={market.baseSymbol}
            quoteSymbol={market.quoteSymbol}
          />
        </Section>

        <Section
          eyebrow="Orders"
          title="Tracked open orders"
          description="Orders placed from this frontend are tracked locally for the connected wallet and can be cancelled here."
        >
          <ConnectedOpenOrders marketAddress={market.address as `0x${string}`} />
        </Section>
      </div>
    </AppShell>
  );
}
