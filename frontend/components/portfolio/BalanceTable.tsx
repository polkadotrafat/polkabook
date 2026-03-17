import type { PortfolioBalance } from "@/lib/types/market";
import { formatTokenAmount } from "@/lib/format/units";

type BalanceTableProps = {
  balances: PortfolioBalance[];
};

export function BalanceTable({ balances }: BalanceTableProps) {
  return (
    <div className="overflow-hidden rounded-[20px] border border-[var(--edge)] bg-white/55">
      <div className="grid grid-cols-3 gap-4 border-b border-[var(--edge)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
        <span>Token</span>
        <span>Available</span>
        <span>Locked</span>
      </div>
      <div className="divide-y divide-[var(--edge)]">
        {balances.length === 0 ? (
          <div className="px-4 py-6 text-sm text-[var(--ink-soft)]">
            No wallet-specific balances are loaded.
          </div>
        ) : null}
        {balances.map((balance) => (
          <div
            key={balance.symbol}
            className="grid grid-cols-3 gap-4 px-4 py-4 text-sm"
          >
            <span className="font-semibold text-[var(--ink-strong)]">
              {balance.symbol}
            </span>
            <span className="mono text-[var(--ink-soft)]">
              {formatTokenAmount(balance.available)}
            </span>
            <span className="mono text-[var(--ink-soft)]">
              {formatTokenAmount(balance.locked)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
