"use client";

import type { MarketDetail } from "@/lib/types/market";
import { formatTokenAmount } from "@/lib/format/units";
import { useAccount } from "wagmi";

type OrderTicketProps = {
  market: MarketDetail;
};

export function OrderTicket({ market }: OrderTicketProps) {
  const { address, isConnected } = useAccount();

  return (
    <section className="panel section-block">
      <div className="grid gap-2">
        <span className="eyebrow">Trade</span>
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink-strong)]">
          Order ticket
        </h2>
        <p className="text-sm leading-7 text-[var(--ink-soft)]">
          The on-chain contracts are live on Paseo. This frontend is currently
          focused on market visibility rather than transaction submission.
        </p>
        <p className="text-sm leading-7 text-[var(--ink-soft)]">
          For this order book, adding liquidity means depositing tokens into the
          vault and placing resting bid or ask orders.
        </p>
        {isConnected && address ? (
          <p className="mono text-xs text-[var(--ink-soft)]">
            Connected wallet: {address.slice(0, 6)}...{address.slice(-4)}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4">
        <div className="grid gap-2">
          <label className="text-sm font-medium text-[var(--ink-soft)]">
            Side
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button className="rounded-2xl border border-[var(--accent-soft)] bg-[var(--accent-soft)] px-4 py-3 text-sm font-semibold text-[var(--accent)]">
              Buy
            </button>
            <button className="rounded-2xl border border-[var(--edge)] bg-white/60 px-4 py-3 text-sm font-semibold text-[var(--ink-soft)]">
              Sell
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <label className="text-sm font-medium text-[var(--ink-soft)]">
              Price
            </label>
            <div className="rounded-2xl border border-[var(--edge)] bg-white/65 px-4 py-3">
              <span className="mono text-sm text-[var(--ink-strong)]">
                {formatTokenAmount(market.topOfBook.bestAskPrice)}
              </span>
            </div>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-[var(--ink-soft)]">
              Quantity
            </label>
            <div className="rounded-2xl border border-[var(--edge)] bg-white/65 px-4 py-3">
              <span className="mono text-sm text-[var(--ink-strong)]">1.0000</span>
            </div>
          </div>
        </div>

        <div className="grid gap-3 rounded-[20px] border border-[var(--edge)] bg-white/60 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--ink-soft)]">Minimum quantity</span>
            <span className="mono text-[var(--ink-strong)]">
              {formatTokenAmount(market.minOrderQuantity)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--ink-soft)]">Minimum notional</span>
            <span className="mono text-[var(--ink-strong)]">
              {formatTokenAmount(market.minOrderNotional)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--ink-soft)]">Reserve token</span>
            <span className="mono text-[var(--ink-strong)]">{market.quoteSymbol}</span>
          </div>
        </div>

        <button className="button-primary w-full" disabled>
          {isConnected ? "Trade flow coming next" : "Connect MetaMask above to trade"}
        </button>
      </div>
    </section>
  );
}
