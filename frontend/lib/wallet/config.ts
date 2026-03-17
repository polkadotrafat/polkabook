"use client";

import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import type { Chain } from "viem";

import { TESTNET_RPC_URL } from "@/lib/config/deployment";

export const polkadotHubPaseo = {
  id: 420420417,
  name: "Polkadot Hub Paseo",
  nativeCurrency: {
    name: "Paseo",
    symbol: "PAS",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [TESTNET_RPC_URL],
    },
    public: {
      http: [TESTNET_RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: "Polkadot Hub Explorer",
      url: "https://blockscout-passet-hub.parity-testnet.parity.io",
    },
  },
  testnet: true,
} satisfies Chain;

export const walletConfig = createConfig({
  chains: [polkadotHubPaseo],
  connectors: [
    injected({
      shimDisconnect: true,
    }),
  ],
  transports: {
    [polkadotHubPaseo.id]: http(TESTNET_RPC_URL),
  },
  ssr: true,
});
