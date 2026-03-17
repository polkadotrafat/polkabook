"use client";

import { useEffect } from "react";
import { useAccount, useReadContract } from "wagmi";
import { parseAbi } from "viem";

import { DEPLOYED_MARKET } from "@/lib/config/deployment";
import { formatTokenAmount } from "@/lib/format/units";
import { onPolkaBookRefresh } from "@/lib/uiSync";

const erc20Abi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
]);

type ConnectedWalletTokenBalancesProps = {
  baseSymbol: string;
  quoteSymbol: string;
};

export function ConnectedWalletTokenBalances({
  baseSymbol,
  quoteSymbol,
}: ConnectedWalletTokenBalancesProps) {
  const { address, isConnected } = useAccount();

  const baseBalance = useReadContract({
    address: DEPLOYED_MARKET.baseToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address),
      refetchInterval: 10_000,
    },
  });

  const quoteBalance = useReadContract({
    address: DEPLOYED_MARKET.quoteToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address),
      refetchInterval: 10_000,
    },
  });

  useEffect(() => {
    return onPolkaBookRefresh(() => {
      baseBalance.refetch();
      quoteBalance.refetch();
    });
  }, [baseBalance, quoteBalance]);

  if (!isConnected || !address) {
    return (
      <div className="rounded-[20px] border border-dashed border-[var(--edge)] bg-white/40 px-4 py-6 text-sm text-[var(--ink-soft)]">
        Connect MetaMask to read your wallet token balances.
      </div>
    );
  }

  if (baseBalance.isLoading || quoteBalance.isLoading) {
    return (
      <div className="rounded-[20px] border border-dashed border-[var(--edge)] bg-white/40 px-4 py-6 text-sm text-[var(--ink-soft)]">
        Loading wallet balances for {address.slice(0, 6)}...{address.slice(-4)}.
      </div>
    );
  }

  if (baseBalance.isError || quoteBalance.isError) {
    return (
      <div className="rounded-[20px] border border-dashed border-[var(--edge)] bg-white/40 px-4 py-6 text-sm text-[var(--negative)]">
        Failed to load wallet token balances.
      </div>
    );
  }

  const rows = [
    { symbol: baseSymbol, balance: baseBalance.data ?? 0n },
    { symbol: quoteSymbol, balance: quoteBalance.data ?? 0n },
  ];

  return (
    <div className="overflow-hidden rounded-[20px] border border-[var(--edge)] bg-white/55">
      <div className="grid grid-cols-2 gap-4 border-b border-[var(--edge)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
        <span>Token</span>
        <span>Wallet balance</span>
      </div>
      <div className="divide-y divide-[var(--edge)]">
        {rows.map((row) => (
          <div
            key={row.symbol}
            className="grid grid-cols-2 gap-4 px-4 py-4 text-sm"
          >
            <span className="font-semibold text-[var(--ink-strong)]">
              {row.symbol}
            </span>
            <span className="mono text-[var(--ink-soft)]">
              {formatTokenAmount(row.balance)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
