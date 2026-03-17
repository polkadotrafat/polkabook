import Link from "next/link";

import { StatusBadge } from "@/components/system/StatusBadge";
import type { MarketSummary } from "@/lib/types/market";
import { formatCompactNumber, formatPercentSpread, formatTokenAmount } from "@/lib/format/units";

type PairTableProps = {
  markets: MarketSummary[];
};

export function PairTable({ markets }: PairTableProps) {
  return (
    <div className="overflow-hidden rounded-[20px] border border-[var(--edge)] bg-white/55">
      <div className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr_0.8fr] gap-4 border-b border-[var(--edge)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
        <span>Pair</span>
        <span>Best bid</span>
        <span>Best ask</span>
        <span>Spread</span>
        <span>Status</span>
      </div>

      <div className="divide-y divide-[var(--edge)]">
        {markets.map((market) => (
          <Link
            key={market.address}
            className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr_0.8fr] gap-4 px-4 py-4 transition hover:bg-[var(--accent-soft)]/40"
            href={`/markets/${market.address}`}
          >
            <div className="space-y-1">
              <div className="font-semibold text-[var(--ink-strong)]">
                {market.symbol}
              </div>
              <div className="mono text-xs text-[var(--ink-soft)]">
                {market.address.slice(0, 6)}...{market.address.slice(-4)}
              </div>
            </div>

            <div>
              <div className="font-semibold text-[var(--ink-strong)]">
                {market.topOfBook.bestBidPrice === 0n
                  ? "—"
                  : formatTokenAmount(market.topOfBook.bestBidPrice)}
              </div>
              <div className="text-xs text-[var(--ink-soft)]">
                {market.topOfBook.bestBidQuantity === 0n
                  ? "No bids"
                  : `${formatCompactNumber(market.topOfBook.bestBidQuantity)} base`}
              </div>
            </div>

            <div>
              <div className="font-semibold text-[var(--ink-strong)]">
                {market.topOfBook.bestAskPrice === 0n
                  ? "—"
                  : formatTokenAmount(market.topOfBook.bestAskPrice)}
              </div>
              <div className="text-xs text-[var(--ink-soft)]">
                {market.topOfBook.bestAskQuantity === 0n
                  ? "No asks"
                  : `${formatCompactNumber(market.topOfBook.bestAskQuantity)} base`}
              </div>
            </div>

            <div className="font-semibold text-[var(--ink-strong)]">
              {formatPercentSpread(
                market.topOfBook.bestBidPrice,
                market.topOfBook.bestAskPrice,
              )}
            </div>

            <div className="flex items-start">
              <StatusBadge tone={market.topOfBook.crossed ? "danger" : "neutral"}>
                {market.enabled
                  ? market.topOfBook.crossed
                    ? "Crossed"
                    : "Live"
                  : "Disabled"}
              </StatusBadge>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
