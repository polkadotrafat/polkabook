"use client";

import { useEffect } from "react";
import { useAccount, useReadContract } from "wagmi";
import { parseAbi } from "viem";

import { BalanceTable } from "@/components/portfolio/BalanceTable";
import { DEPLOYED_MARKET } from "@/lib/config/deployment";
import { onPolkaBookRefresh } from "@/lib/uiSync";

const vaultAbi = parseAbi([
  "function balances(address user, address token) view returns (uint256 amount)",
  "function locked(address user, address token) view returns (uint256 amount)",
]);

type ConnectedVaultBalancesProps = {
  baseSymbol: string;
  quoteSymbol: string;
};

export function ConnectedVaultBalances({
  baseSymbol,
  quoteSymbol,
}: ConnectedVaultBalancesProps) {
  const { address, isConnected } = useAccount();

  const baseAvailable = useReadContract({
    address: DEPLOYED_MARKET.vault,
    abi: vaultAbi,
    functionName: "balances",
    args: address ? [address, DEPLOYED_MARKET.baseToken] : undefined,
    query: {
      enabled: Boolean(address),
      refetchInterval: 10_000,
    },
  });

  const baseLocked = useReadContract({
    address: DEPLOYED_MARKET.vault,
    abi: vaultAbi,
    functionName: "locked",
    args: address ? [address, DEPLOYED_MARKET.baseToken] : undefined,
    query: {
      enabled: Boolean(address),
      refetchInterval: 10_000,
    },
  });

  const quoteAvailable = useReadContract({
    address: DEPLOYED_MARKET.vault,
    abi: vaultAbi,
    functionName: "balances",
    args: address ? [address, DEPLOYED_MARKET.quoteToken] : undefined,
    query: {
      enabled: Boolean(address),
      refetchInterval: 10_000,
    },
  });

  const quoteLocked = useReadContract({
    address: DEPLOYED_MARKET.vault,
    abi: vaultAbi,
    functionName: "locked",
    args: address ? [address, DEPLOYED_MARKET.quoteToken] : undefined,
    query: {
      enabled: Boolean(address),
      refetchInterval: 10_000,
    },
  });

  useEffect(() => {
    return onPolkaBookRefresh(() => {
      baseAvailable.refetch();
      baseLocked.refetch();
      quoteAvailable.refetch();
      quoteLocked.refetch();
    });
  }, [baseAvailable, baseLocked, quoteAvailable, quoteLocked]);

  if (!isConnected || !address) {
    return (
      <div className="rounded-[20px] border border-dashed border-[var(--edge)] bg-white/40 px-4 py-6 text-sm text-[var(--ink-soft)]">
        Connect MetaMask to read your live vault balances.
      </div>
    );
  }

  if (
    baseAvailable.isLoading ||
    baseLocked.isLoading ||
    quoteAvailable.isLoading ||
    quoteLocked.isLoading
  ) {
    return (
      <div className="rounded-[20px] border border-dashed border-[var(--edge)] bg-white/40 px-4 py-6 text-sm text-[var(--ink-soft)]">
        Loading vault balances for {address.slice(0, 6)}...{address.slice(-4)}.
      </div>
    );
  }

  if (
    baseAvailable.isError ||
    baseLocked.isError ||
    quoteAvailable.isError ||
    quoteLocked.isError
  ) {
    return (
      <div className="rounded-[20px] border border-dashed border-[var(--edge)] bg-white/40 px-4 py-6 text-sm text-[var(--negative)]">
        Failed to load vault balances for the connected wallet.
      </div>
    );
  }

  return (
    <BalanceTable
      balances={[
        {
          symbol: baseSymbol,
          available: baseAvailable.data ?? 0n,
          locked: baseLocked.data ?? 0n,
        },
        {
          symbol: quoteSymbol,
          available: quoteAvailable.data ?? 0n,
          locked: quoteLocked.data ?? 0n,
        },
      ]}
    />
  );
}
