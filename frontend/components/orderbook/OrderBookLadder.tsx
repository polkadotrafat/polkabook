import type { MarketDetail } from "@/lib/types/market";
import { formatTokenAmount } from "@/lib/format/units";

type OrderBookLadderProps = {
  market: MarketDetail;
};

type SideProps = {
  side: "Bids" | "Asks";
  tone: "bid" | "ask";
  rows: MarketDetail["bids"];
};

function LadderSide({ side, tone, rows }: SideProps) {
  const toneClass =
    tone === "bid"
      ? "bg-[var(--positive-soft)] text-[var(--positive)]"
      : "bg-[var(--negative-soft)] text-[var(--negative)]";

  return (
    <div className="grid gap-3 rounded-[20px] border border-[var(--edge)] bg-white/55 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--ink-strong)]">{side}</h2>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${toneClass}`}>
          {rows.length} levels
        </span>
      </div>

      <div className="grid gap-2">
        <div className="grid grid-cols-3 gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
          <span>Price</span>
          <span>Quantity</span>
          <span>Total</span>
        </div>
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--edge)] px-3 py-6 text-sm text-[var(--ink-soft)]">
            No active {side.toLowerCase()} on the deployed book.
          </div>
        ) : null}
        {rows.map((row) => (
          <div
            key={`${tone}-${row.price}-${row.orderCount}`}
            className="grid grid-cols-3 gap-3 rounded-2xl border border-[var(--edge)] px-3 py-3"
          >
            <span className="mono text-sm font-semibold text-[var(--ink-strong)]">
              {formatTokenAmount(row.price)}
            </span>
            <span className="mono text-sm text-[var(--ink-soft)]">
              {formatTokenAmount(row.quantity)}
            </span>
            <span className="text-sm text-[var(--ink-soft)]">
              {row.orderCount} orders
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OrderBookLadder({ market }: OrderBookLadderProps) {
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <LadderSide rows={market.asks} side="Asks" tone="ask" />
      <LadderSide rows={market.bids} side="Bids" tone="bid" />
    </section>
  );
}
