"use client";

import { useMemo, useState } from "react";
import { parseAbi } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";

import { DEPLOYED_MARKET } from "@/lib/config/deployment";
import { parseTokenAmount } from "@/lib/format/units";
import { emitPolkaBookRefresh } from "@/lib/uiSync";
import { polkadotHubPaseo } from "@/lib/wallet/config";

const erc20Abi = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const vaultAbi = parseAbi([
  "function deposit(address token, uint256 amount)",
  "function withdraw(address token, uint256 amount)",
]);

type VaultActionsPanelProps = {
  baseSymbol: string;
  quoteSymbol: string;
};

export function VaultActionsPanel({
  baseSymbol,
  quoteSymbol,
}: VaultActionsPanelProps) {
  const publicClient = usePublicClient();
  const { address, chainId, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [token, setToken] = useState<"base" | "quote">("base");
  const [amount, setAmount] = useState("");
  const [busyAction, setBusyAction] = useState<"approve" | "deposit" | "withdraw" | null>(null);
  const [message, setMessage] = useState<string>("");

  const selectedTokenAddress =
    token === "base" ? DEPLOYED_MARKET.baseToken : DEPLOYED_MARKET.quoteToken;
  const selectedSymbol = token === "base" ? baseSymbol : quoteSymbol;

  const parsedAmount = useMemo(() => {
    try {
      return parseTokenAmount(amount);
    } catch {
      return null;
    }
  }, [amount]);

  const allowance = useReadContract({
    address: selectedTokenAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, DEPLOYED_MARKET.vault] : undefined,
    query: {
      enabled: Boolean(address),
      refetchInterval: 10_000,
    },
  });

  const needsApproval =
    parsedAmount !== null &&
    parsedAmount > 0n &&
    (allowance.data ?? 0n) < parsedAmount;

  const disabled =
    !isConnected ||
    !address ||
    chainId !== polkadotHubPaseo.id ||
    !publicClient ||
    parsedAmount === null ||
    parsedAmount <= 0n;

  async function runAction(action: "approve" | "deposit" | "withdraw") {
    if (disabled || parsedAmount === null || parsedAmount <= 0n || !publicClient) {
      return;
    }

    setBusyAction(action);
    setMessage("");

    try {
      const hash =
        action === "approve"
          ? await writeContractAsync({
              address: selectedTokenAddress,
              abi: erc20Abi,
              functionName: "approve",
              args: [DEPLOYED_MARKET.vault, parsedAmount],
              chainId: polkadotHubPaseo.id,
            })
          : await writeContractAsync({
              address: DEPLOYED_MARKET.vault,
              abi: vaultAbi,
              functionName: action,
              args: [selectedTokenAddress, parsedAmount],
              chainId: polkadotHubPaseo.id,
            });

      await publicClient.waitForTransactionReceipt({ hash });
      setMessage(
        action === "approve"
          ? `Approved ${selectedSymbol} for vault deposit.`
          : action === "deposit"
            ? `Deposited ${selectedSymbol} into the vault.`
            : `Withdrew ${selectedSymbol} from the vault.`,
      );
      setAmount("");
      await allowance.refetch();
      emitPolkaBookRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Transaction failed");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="panel section-block">
      <div className="grid gap-2">
        <span className="eyebrow">Vault Actions</span>
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink-strong)]">
          Deposit or withdraw liquidity
        </h2>
        <p className="text-sm leading-7 text-[var(--ink-soft)]">
          Add liquidity by approving a token, depositing it into the vault, and
          then placing resting orders on the market.
        </p>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-2">
          <label className="text-sm font-medium text-[var(--ink-soft)]">Token</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${token === "base" ? "border-[var(--accent-soft)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--edge)] bg-white/60 text-[var(--ink-soft)]"}`}
              onClick={() => setToken("base")}
              type="button"
            >
              {baseSymbol}
            </button>
            <button
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${token === "quote" ? "border-[var(--accent-soft)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--edge)] bg-white/60 text-[var(--ink-soft)]"}`}
              onClick={() => setToken("quote")}
              type="button"
            >
              {quoteSymbol}
            </button>
          </div>
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium text-[var(--ink-soft)]">Amount</label>
          <input
            className="rounded-2xl border border-[var(--edge)] bg-white/65 px-4 py-3 text-sm text-[var(--ink-strong)] outline-none focus:border-[var(--accent)]"
            onChange={(event) => setAmount(event.target.value)}
            placeholder={`0.0 ${selectedSymbol}`}
            value={amount}
          />
        </div>

        <div className="grid gap-3 rounded-[20px] border border-[var(--edge)] bg-white/60 p-4 text-sm text-[var(--ink-soft)]">
          <div className="flex items-center justify-between">
            <span>Selected token</span>
            <span className="mono text-[var(--ink-strong)]">{selectedSymbol}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Current allowance</span>
            <span className="mono text-[var(--ink-strong)]">
              {allowance.data !== undefined ? allowance.data.toString() : "—"}
            </span>
          </div>
          {needsApproval ? (
            <p className="text-[var(--negative)]">
              Approval is required before this deposit amount can be moved into the vault.
            </p>
          ) : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <button
            className="button-secondary"
            disabled={disabled || busyAction !== null}
            onClick={() => runAction("approve")}
            type="button"
          >
            {busyAction === "approve" ? "Approving..." : "Approve"}
          </button>
          <button
            className="button-primary"
            disabled={disabled || needsApproval || busyAction !== null}
            onClick={() => runAction("deposit")}
            type="button"
          >
            {busyAction === "deposit" ? "Depositing..." : "Deposit"}
          </button>
          <button
            className="button-secondary"
            disabled={disabled || busyAction !== null}
            onClick={() => runAction("withdraw")}
            type="button"
          >
            {busyAction === "withdraw" ? "Withdrawing..." : "Withdraw"}
          </button>
        </div>

        {!isConnected ? (
          <p className="text-sm text-[var(--ink-soft)]">Connect MetaMask to manage vault funds.</p>
        ) : null}
        {chainId !== undefined && chainId !== polkadotHubPaseo.id ? (
          <p className="text-sm text-[var(--negative)]">
            Switch MetaMask to Polkadot Hub Paseo before sending transactions.
          </p>
        ) : null}
        {message ? <p className="text-sm text-[var(--ink-soft)]">{message}</p> : null}
      </div>
    </section>
  );
}
