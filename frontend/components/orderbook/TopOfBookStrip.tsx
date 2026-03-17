import type { MarketDetail } from "@/lib/types/market";
import { formatPercentSpread, formatTokenAmount } from "@/lib/format/units";

type TopOfBookStripProps = {
  market: MarketDetail;
};

export function TopOfBookStrip({ market }: TopOfBookStripProps) {
  const { topOfBook } = market;

  return (
    <section className="panel grid gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="eyebrow">Market</p>
          <h1 className="text-4xl font-semibold tracking-[-0.04em] text-[var(--ink-strong)]">
            {market.symbol}
          </h1>
          <p className="text-sm leading-7 text-[var(--ink-soft)]">
            {market.baseSymbol} / {market.quoteSymbol} on a bucketed linked-list
            order book with a bounded Rust matcher frontier.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-[var(--positive-soft)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--positive)]">
            {market.enabled ? "Trading enabled" : "Trading disabled"}
          </span>
          <span className="rounded-full bg-[var(--accent-soft)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
            Depth {market.depth}
          </span>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="metric-card">
          <span className="metric-label">Best bid</span>
          <span className="metric-value">
            {topOfBook.bestBidPrice === 0n
              ? "—"
              : formatTokenAmount(topOfBook.bestBidPrice)}
          </span>
          <span className="text-sm text-[var(--ink-soft)]">
            {topOfBook.bestBidQuantity === 0n
              ? "No resting bids"
              : `${formatTokenAmount(topOfBook.bestBidQuantity)} ${market.baseSymbol}`}
          </span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Best ask</span>
          <span className="metric-value">
            {topOfBook.bestAskPrice === 0n
              ? "—"
              : formatTokenAmount(topOfBook.bestAskPrice)}
          </span>
          <span className="text-sm text-[var(--ink-soft)]">
            {topOfBook.bestAskQuantity === 0n
              ? "No resting asks"
              : `${formatTokenAmount(topOfBook.bestAskQuantity)} ${market.baseSymbol}`}
          </span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Spread</span>
          <span className="metric-value">
            {formatPercentSpread(
              topOfBook.bestBidPrice,
              topOfBook.bestAskPrice,
            )}
          </span>
          <span className="text-sm text-[var(--ink-soft)]">
            {topOfBook.crossed ? "Crossed book" : "Normal book"}
          </span>
        </div>
      </div>
    </section>
  );
}
