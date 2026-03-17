# PolkaBook

PolkaBook is a hybrid on-chain central limit order book for the Polkadot ecosystem.

The project is built around a deliberate split:

- Solidity owns persistent state, custody, pair configuration, and settlement.
- A Rust kernel compiled for PolkaVM owns bounded matching computation.

The goal is not to recreate a full unbounded exchange engine on-chain. The goal is to make a bounded, deterministic, top-of-book order-book architecture practical under PolkaVM and Polkadot Hub constraints.

## Repository Structure

- [`kernel/`](/Users/rafat/code/hackathons/polkabook/kernel)
  Rust matcher kernel compiled to `.polkavm`.
- [`contracts/`](/Users/rafat/code/hackathons/polkabook/contracts)
  Solidity contracts, Hardhat tests, Ignition modules, and deployment scripts.
- [`frontend/`](/Users/rafat/code/hackathons/polkabook/frontend)
  Next.js frontend.
- [`overview.md`](/Users/rafat/code/hackathons/polkabook/overview.md)
  Original project overview.
- [`Architecture.md`](/Users/rafat/code/hackathons/polkabook/Architecture.md)
  Current implementation architecture.

## Current Architecture

The live implementation is organized around these components:

- `MatcherKernel` in Rust
  Stateless, `no_std`, bounded matching engine.
- `Vault.sol`
  Custody and locked-balance accounting.
- `PairRegistry.sol`
  Pair deployment and pair-level trading configuration.
- `OrderBookBuckets.sol`
  Bucketed linked-list order book with FIFO queues per price level.
- `OrderBook.sol`
  Legacy sorted-array reference implementation for comparison and benchmarking.
- frontend read layer
  Pair discovery, top-of-book display, quote preview, and portfolio scaffolding.

The current bucketed order book:

- stores active price levels as doubly linked lists
- preserves FIFO inside each level
- collects only a bounded matching frontier
- fails closed when tombstone fragmentation exceeds `MAX_SKIPS`

The Rust kernel:

- validates sorted input
- does not sort internally anymore
- matches using a bounded iterative loop
- returns compact trade results plus consumed frontier counts

For the full architecture, see [`Architecture.md`](/Users/rafat/code/hackathons/polkabook/Architecture.md).

## Tech Stack

### Kernel

- Rust nightly
- PolkaVM / `pallet-revive-uapi`
- custom binary ABI

### Contracts

- Solidity `0.8.28`
- Hardhat
- `@parity/hardhat-polkadot`
- Hardhat Ignition

### Frontend

- Next.js App Router
- React 19
- TypeScript
- Tailwind CSS v4

## Core Contract Flow

### Order placement

1. user deposits assets into `Vault`
2. user calls `placeOrder(...)`
3. `OrderBookBuckets` validates pair-level constraints
4. funds are locked in `Vault`
5. order is appended to its price level
6. the book collects top bid/ask frontiers
7. the matcher kernel is called
8. trades are applied and settled through `Vault`

### Quote flow

`quoteOrder(...)`:

- validates the hypothetical order
- inserts it into a read-only frontier
- calls the matcher with `staticcall`
- returns trade count, consumed counts, and executed quantities

### Pair deployment flow

`PairRegistry` is the intended pair deployment surface.

For each pair it can:

- deploy a new `OrderBookBuckets`
- store pair metadata
- set minimum quantity and minimum notional
- enable or disable trading

## Prerequisites

### General

- Node.js 20+
- npm

### Kernel build

- Rust nightly
- `cargo`
- `polkatool`

### Testnet deployment

- funded wallet private key for Polkadot Hub Paseo / Asset Hub Paseo
- EVM RPC URL
- Substrate WS RPC URL

## Environment Variables

The contracts package reads [`contracts/.env`](/Users/rafat/code/hackathons/polkabook/contracts/.env) automatically.

Start from [`contracts/.env.example`](/Users/rafat/code/hackathons/polkabook/contracts/.env.example):

```env
PRIVATE_KEY=0xyour_private_key_here
TESTNET_RPC_URL=https://testnet-passet-hub-eth-rpc.polkadot.io
POLKADOT_RPC_URL=wss://asset-hub-paseo-rpc.n.dwellir.com
LOCALNODE_RPC_URL=http://127.0.0.1:8545
KERNEL_BYTECODE_PATH=../kernel/matcher.polkavm
```

Meaning:

- `PRIVATE_KEY`
  signer used for testnet deployments
- `TESTNET_RPC_URL`
  EVM-compatible RPC endpoint
- `POLKADOT_RPC_URL`
  Substrate websocket endpoint used for Revive / PolkaVM flows
- `LOCALNODE_RPC_URL`
  local RPC override
- `KERNEL_BYTECODE_PATH`
  optional override for the built kernel artifact

## Installation

### Contracts

```bash
cd contracts
npm install
```

### Frontend

```bash
cd frontend
npm install
```

### Kernel

Make sure Rust nightly and `polkatool` are available, then:

```bash
cd kernel
./build.sh
```

This builds:

- [`kernel/matcher.polkavm`](/Users/rafat/code/hackathons/polkabook/kernel/matcher.polkavm)

## Running Tests

### Contracts

```bash
cd contracts
npm test
```

The Solidity suite currently covers:

- codec packing/unpacking
- vault behavior
- bucketed order book behavior
- pair registry
- integration paths
- benchmark comparisons

### Kernel

```bash
cd kernel
cargo test --lib
```

### Frontend

```bash
cd frontend
npm run lint
npx next build --webpack
```

`next build --webpack` is currently the safer verification path in this workspace than Turbopack.

## Local Development

### Frontend

```bash
cd frontend
npm run dev
```

### Contracts

Hardhat local testing works with:

```bash
cd contracts
npm test
```

The repo also contains Polkadot Hardhat configuration in [`contracts/hardhat.config.ts`](/Users/rafat/code/hackathons/polkabook/contracts/hardhat.config.ts).

## Deployment

### 1. Build the kernel

```bash
cd kernel
./build.sh
```

### 2. Prepare contract environment

Create [`contracts/.env`](/Users/rafat/code/hackathons/polkabook/contracts/.env) using the example file.

### 3. Deploy the kernel

Current script:

- [`contracts/scripts/deployKernel.ts`](/Users/rafat/code/hackathons/polkabook/contracts/scripts/deployKernel.ts)

Command:

```bash
cd contracts
npm run deploy:kernel:testnet
```

This script is intended to:

- read `matcher.polkavm`
- deploy it through the configured EVM-compatible RPC
- write a manifest under `deployments/<network>/kernel.json`

### 4. Deploy demo pair contracts and ERC-20s

Ignition modules:

- [`contracts/ignition/modules/MyToken.ts`](/Users/rafat/code/hackathons/polkabook/contracts/ignition/modules/MyToken.ts)
- [`contracts/ignition/modules/PolkaBookPair.ts`](/Users/rafat/code/hackathons/polkabook/contracts/ignition/modules/PolkaBookPair.ts)
- generic parameter templates:
  - [`contracts/ignition/parameters/polkadotHubTestnet.example.json`](/Users/rafat/code/hackathons/polkabook/contracts/ignition/parameters/polkadotHubTestnet.example.json)
  - [`contracts/ignition/parameters/localNode.example.json`](/Users/rafat/code/hackathons/polkabook/contracts/ignition/parameters/localNode.example.json)

The pair deployment module currently deploys:

- base token
- quote token
- `Vault`
- `OrderBookBuckets`

and authorizes the deployed order book in the vault.

Once you have the real kernel address, you can deploy the pair module with Hardhat Ignition and pass:

- `initialOwner`
- `matcherKernel`
- token names/symbols/supplies
- `minOrderQuantity`
- `minOrderNotional`

The pair deployment stays generic. `matcherKernel` is always an input parameter, so any valid deployed kernel address can be used.

Recommended flow:

1. copy `contracts/ignition/parameters/polkadotHubTestnet.example.json` to `contracts/ignition/parameters/polkadotHubTestnet.json`
2. fill in:
   - `initialOwner`
   - `matcherKernel`
   - token names/symbols/supplies
   - pair minimums
3. deploy with:

```bash
cd contracts
npm run deploy:pair:testnet -- --parameters ignition/parameters/polkadotHubTestnet.json
```

## Frontend Status

The frontend is in active implementation and currently provides:

- landing page
- market list
- pair detail route
- top-of-book and ladder views
- quote preview scaffold
- balance and open-order tables

Current frontend notes:

- it is still read-only
- it uses a typed local adapter layer for market data
- contract reads and wallet flows are the next integration step

Frontend files:

- [`frontend/app`](/Users/rafat/code/hackathons/polkabook/frontend/app)
- [`frontend/components`](/Users/rafat/code/hackathons/polkabook/frontend/components)
- [`frontend/lib`](/Users/rafat/code/hackathons/polkabook/frontend/lib)

## Known Limitations

- frontend is still read-only and not yet wired to live contract reads
- frontend is still read-only
- there is no indexing layer yet for full historical order and trade views
- the current quote and portfolio views are scaffolded ahead of live wallet integration

## Important Files

### Documentation

- [`Architecture.md`](/Users/rafat/code/hackathons/polkabook/Architecture.md)
- [`overview.md`](/Users/rafat/code/hackathons/polkabook/overview.md)

### Kernel

- [`kernel/src/kernel.rs`](/Users/rafat/code/hackathons/polkabook/kernel/src/kernel.rs)
- [`kernel/src/main.rs`](/Users/rafat/code/hackathons/polkabook/kernel/src/main.rs)
- [`kernel/build.sh`](/Users/rafat/code/hackathons/polkabook/kernel/build.sh)

### Contracts

- [`contracts/contracts/OrderBookBuckets.sol`](/Users/rafat/code/hackathons/polkabook/contracts/contracts/OrderBookBuckets.sol)
- [`contracts/contracts/Vault.sol`](/Users/rafat/code/hackathons/polkabook/contracts/contracts/Vault.sol)
- [`contracts/contracts/PairRegistry.sol`](/Users/rafat/code/hackathons/polkabook/contracts/contracts/PairRegistry.sol)
- [`contracts/contracts/MatcherCodec.sol`](/Users/rafat/code/hackathons/polkabook/contracts/contracts/MatcherCodec.sol)
- [`contracts/scripts/deployKernel.ts`](/Users/rafat/code/hackathons/polkabook/contracts/scripts/deployKernel.ts)
- [`contracts/hardhat.config.ts`](/Users/rafat/code/hackathons/polkabook/contracts/hardhat.config.ts)

### Frontend

- [`frontend/app/layout.tsx`](/Users/rafat/code/hackathons/polkabook/frontend/app/layout.tsx)
- [`frontend/app/page.tsx`](/Users/rafat/code/hackathons/polkabook/frontend/app/page.tsx)
- [`frontend/app/markets/[pairAddress]/page.tsx`](/Users/rafat/code/hackathons/polkabook/frontend/app/markets/[pairAddress]/page.tsx)

## Summary

PolkaBook is currently a working hybrid architecture with:

- a bounded Rust matcher kernel
- a linked-list bucketed Solidity order book
- a hardened vault and registry model
- test coverage across codec, order book, registry, and integration flows
- an in-progress frontend built around the current contract design

The main open integration area is the exact testnet deployment path for the PolkaVM kernel. Everything else in the repo is already structured around that eventual production path.
