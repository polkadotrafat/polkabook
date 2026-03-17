export const TESTNET_RPC_URL =
  process.env.NEXT_PUBLIC_TESTNET_RPC_URL ??
  process.env.TESTNET_RPC_URL ??
  "https://services.polkadothub-rpc.com/testnet/";

export const DEPLOYED_CONTRACTS = {
  matcherKernel: "0x8ef7455e8d01C85Af8ed9CFcc0274f4125737e2f",
  vault: "0x4eEd7fF1d2234232bCfc9707b24ab9E58A7D8F40",
  market: "0xa894C0c4553969072B914DA7E1a1a223624b2530",
  baseToken: "0x8397E32E7f43E75f5BfF7D234905Df34Cb08ea8E",
  quoteToken: "0x1823E9b9b2eD47243aDB66DC49570EED4B5748C5",
} as const;

export const DEPLOYED_MARKET = {
  address: DEPLOYED_CONTRACTS.market,
  baseToken: DEPLOYED_CONTRACTS.baseToken,
  quoteToken: DEPLOYED_CONTRACTS.quoteToken,
  vault: DEPLOYED_CONTRACTS.vault,
  matcherKernel: DEPLOYED_CONTRACTS.matcherKernel,
  depth: 20,
} as const;
