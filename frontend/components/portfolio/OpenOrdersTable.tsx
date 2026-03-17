import type { TrackedOrder } from "@/lib/types/market";
import { formatTokenAmount } from "@/lib/format/units";

type OpenOrdersTableProps = {
  orders: TrackedOrder[];
};

export function OpenOrdersTable({ orders }: OpenOrdersTableProps) {
  return (
    <div className="overflow-hidden rounded-[20px] border border-[var(--edge)] bg-white/55">
      <div className="grid grid-cols-[0.7fr_0.9fr_1fr_1fr_0.8fr] gap-4 border-b border-[var(--edge)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
        <span>Side</span>
        <span>Order</span>
        <span>Price</span>
        <span>Quantity</span>
        <span>Status</span>
      </div>
      <div className="divide-y divide-[var(--edge)]">
        {orders.length === 0 ? (
          <div className="px-4 py-6 text-sm text-[var(--ink-soft)]">
            No tracked open orders.
          </div>
        ) : null}
        {orders.map((order) => (
          <div
            key={order.orderId}
            className="grid grid-cols-[0.7fr_0.9fr_1fr_1fr_0.8fr] gap-4 px-4 py-4 text-sm"
          >
            <span
              className={
                order.side === "Bid"
                  ? "font-semibold text-[var(--positive)]"
                  : "font-semibold text-[var(--negative)]"
              }
            >
              {order.side}
            </span>
            <span className="mono text-[var(--ink-soft)]">#{order.orderId}</span>
            <span className="mono text-[var(--ink-soft)]">
              {formatTokenAmount(order.price)}
            </span>
            <span className="mono text-[var(--ink-soft)]">
              {formatTokenAmount(order.quantity - order.filled)} /{" "}
              {formatTokenAmount(order.quantity)}
            </span>
            <span className="text-[var(--ink-strong)]">{order.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
