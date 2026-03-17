"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";

import { emitPolkaBookRefresh } from "@/lib/uiSync";
import { polkadotHubPaseo } from "@/lib/wallet/config";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WalletButton() {
  const router = useRouter();
  const { address, chain, isConnected, isConnecting } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const switchingAccountRef = useRef(false);

  const injectedConnector = useMemo(
    () => connectors.find((connector) => connector.type === "injected") ?? connectors[0],
    [connectors],
  );

  useEffect(() => {
    const provider = typeof window === "undefined" ? undefined : window.ethereum;
    if (!provider?.on || !provider.removeListener) {
      return;
    }

    const handleAccountsChanged = (accounts: string[]) => {
      if (switchingAccountRef.current) {
        switchingAccountRef.current = false;
        setSwitchingAccount(false);
      }

      if (accounts.length > 0) {
        emitPolkaBookRefresh();
        router.refresh();
      }
    };

    provider.on("accountsChanged", handleAccountsChanged);
    return () => {
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
    };
  }, [router]);

  async function requestAccountSwitch() {
    if (typeof window === "undefined" || !window.ethereum?.request) {
      return;
    }

    switchingAccountRef.current = true;
    setSwitchingAccount(true);

    try {
      await window.ethereum.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });

      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];

      switchingAccountRef.current = false;
      setSwitchingAccount(false);

      if (accounts.length > 0) {
        emitPolkaBookRefresh();
        router.refresh();
      }
    } catch {
      switchingAccountRef.current = false;
      setSwitchingAccount(false);
    }
  }

  if (!isConnected || !address) {
    return (
      <button
        className="button-primary"
        disabled={!injectedConnector || isPending || isConnecting}
        onClick={() => {
          if (!injectedConnector) {
            return;
          }
          connect({ connector: injectedConnector });
        }}
        type="button"
      >
        {isPending || isConnecting ? "Connecting..." : "Connect MetaMask"}
      </button>
    );
  }

  if (chain?.id !== polkadotHubPaseo.id) {
    return (
      <button
        className="button-primary"
        disabled={isSwitching}
        onClick={() => switchChain({ chainId: polkadotHubPaseo.id })}
        type="button"
      >
        {isSwitching ? "Switching..." : "Switch to Paseo"}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-full border border-[var(--edge)] bg-white/70 px-4 py-2 text-sm font-medium text-[var(--ink-strong)]">
        {shortAddress(address)}
      </span>
      <button
        className="button-secondary"
        disabled={switchingAccount}
        onClick={requestAccountSwitch}
        type="button"
      >
        {switchingAccount ? "Waiting..." : "Switch wallet"}
      </button>
      <button className="button-secondary" onClick={() => disconnect()} type="button">
        Disconnect
      </button>
    </div>
  );
}
