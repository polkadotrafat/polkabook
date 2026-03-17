import { AppShell } from "@/components/layout/AppShell";
import { Section } from "@/components/layout/Section";
import { ConnectedOpenOrders } from "@/components/portfolio/ConnectedOpenOrders";
import { ConnectedVaultBalances } from "@/components/portfolio/ConnectedVaultBalances";
import { ConnectedWalletTokenBalances } from "@/components/portfolio/ConnectedWalletTokenBalances";
import { VaultActionsPanel } from "@/components/portfolio/VaultActionsPanel";
import { DEPLOYED_MARKET } from "@/lib/config/deployment";
import { getMarketByAddress } from "@/lib/data/polkabook";

export default async function PortfolioPage() {
  const market = await getMarketByAddress(DEPLOYED_MARKET.address);

  if (!market) {
    throw new Error("Primary deployed market was not found.");
  }

  return (
    <AppShell>
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Section
          eyebrow="Portfolio"
          title="Wallet token balances"
          description="Live ERC-20 balances in the connected MetaMask wallet before deposit into the vault."
        >
          <ConnectedWalletTokenBalances
            baseSymbol={market.baseSymbol}
            quoteSymbol={market.quoteSymbol}
          />
        </Section>

        <Section
          eyebrow="Portfolio"
          title="Available and locked balances"
          description="Live vault balances for the connected MetaMask wallet."
        >
          <ConnectedVaultBalances
            baseSymbol={market.baseSymbol}
            quoteSymbol={market.quoteSymbol}
          />
        </Section>

        <Section
          eyebrow="Portfolio"
          title="Manage vault funds"
          description="Approve, deposit, and withdraw the demo tokens directly from MetaMask."
        >
          <VaultActionsPanel
            baseSymbol={market.baseSymbol}
            quoteSymbol={market.quoteSymbol}
          />
        </Section>

        <Section
          eyebrow="Portfolio"
          title="Open orders"
          description="Orders placed from this frontend are tracked locally for the connected wallet."
        >
          <ConnectedOpenOrders marketAddress={DEPLOYED_MARKET.address} />
        </Section>
      </div>
    </AppShell>
  );
}
