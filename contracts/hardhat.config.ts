import { HardhatUserConfig } from "hardhat/config"
import "@nomicfoundation/hardhat-toolbox"
import "@parity/hardhat-polkadot"
import { loadLocalEnv } from "./loadEnv"

loadLocalEnv()

const testnetRpcUrl =
    process.env.TESTNET_RPC_URL ?? "https://services.polkadothub-rpc.com/testnet/"
const localNodeRpcUrl = process.env.LOCALNODE_RPC_URL ?? "http://127.0.0.1:8545"
const testnetPolkadotRpcUrl =
    process.env.POLKADOT_RPC_URL ?? "wss://asset-hub-paseo-rpc.n.dwellir.com"

const polkadotHubTestnetNetwork = {
    polkadot: {
        target: "evm" as const,
    },
    url: testnetRpcUrl,
    polkadotUrl: testnetPolkadotRpcUrl,
    accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
} as any

const config: HardhatUserConfig = {
    solidity: {
        version: "0.8.28",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },
    networks: {
        hardhat: {},
        localNode: {
            polkadot: {
                target: "evm",
            },
            url: localNodeRpcUrl,
        },
        polkadotHubTestnet: polkadotHubTestnetNetwork,
    },
}

export default config
