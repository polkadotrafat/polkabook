import type { MarketDetail } from "@/lib/types/market";
import { formatTokenAmount } from "@/lib/format/units";

type QuotePreviewProps = {
  market: MarketDetail;
};

export function QuotePreview({ market }: QuotePreviewProps) {
  return (
    <section className="panel section-block">
      <div className="grid gap-2">
        <span className="eyebrow">Quote</span>
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink-strong)]">
          Simulated execution
        </h2>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="metric-card">
          <span className="metric-label">Executed base</span>
          <span className="metric-value">
            {formatTokenAmount(market.quote.executedBaseQuantity)}
          </span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Executed quote</span>
          <span className="metric-value">
            {formatTokenAmount(market.quote.executedQuoteQuantity)}
          </span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Trade count</span>
          <span className="metric-value">{market.quote.tradeCount}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Consumed levels</span>
          <span className="metric-value">
            {market.quote.consumedBidCount}/{market.quote.consumedAskCount}
          </span>
        </div>
      </div>

      {market.quote.tradeCount === 0 ? (
        <p className="text-sm leading-7 text-[var(--ink-soft)]">
          Quote requests are not yet wired from the form, so this panel stays at
          zero until interactive trading is added.
        </p>
      ) : null}
    </section>
  );
}
