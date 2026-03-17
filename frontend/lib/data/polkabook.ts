import type {
  MarketDetail,
  MarketSummary,
  OrderBookLevel,
  PortfolioSnapshot,
  TopOfBook,
} from "@/lib/types/market";
import { DEPLOYED_MARKET, TESTNET_RPC_URL } from "@/lib/config/deployment";
import { decodeAbiParameters } from "viem";

const SELECTORS = {
  getTopOfBook: "0xfe2d07e0",
  getTopOrders: "0xc309ff0c",
  minOrderQuantity: "0xde67941c",
  minOrderNotional: "0x10f90877",
  tradingEnabled: "0x4ada218b",
  symbol: "0x95d89b41",
} as const;

const EMPTY_PORTFOLIO: PortfolioSnapshot = {
  balances: [],
  openOrders: [],
};

function encodeUint256(value: bigint) {
  return value.toString(16).padStart(64, "0");
}

async function ethCall(to: string, data: string): Promise<string> {
  const response = await fetch(TESTNET_RPC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method: "eth_call",
      params: [
        {
          to,
          data,
        },
        "latest",
      ],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`eth_call failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    error?: { message?: string };
    result?: string;
  };

  if (payload.error) {
    throw new Error(payload.error.message ?? "eth_call returned an error");
  }

  if (!payload.result) {
    throw new Error("eth_call returned no result");
  }

  return payload.result;
}

function readWord(data: string, index: number) {
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  const start = index * 64;
  const end = start + 64;
  const word = hex.slice(start, end);
  if (word.length !== 64) {
    return 0n;
  }
  return BigInt(`0x${word}`);
}

function decodeTopOfBook(data: string): TopOfBook {
  return {
    bestBidPrice: readWord(data, 0),
    bestBidQuantity: readWord(data, 1),
    bestAskPrice: readWord(data, 2),
    bestAskQuantity: readWord(data, 3),
    crossed: readWord(data, 4) !== 0n,
  };
}

function decodeBool(data: string) {
  return readWord(data, 0) !== 0n;
}

function decodeUint128(data: string) {
  return readWord(data, 0);
}

function decodeTopOrders(data: string) {
  const offset = Number(readWord(data, 0));
  const length = Number(readWord(data, offset / 32));
  const firstTupleWord = offset / 32 + 1;
  const tupleSize = 6;

  const orders: Array<{
    orderId: bigint;
    price: bigint;
    quantity: bigint;
    filled: bigint;
    timestamp: bigint;
    side: bigint;
  }> = [];

  for (let i = 0; i < length; i += 1) {
    const base = firstTupleWord + i * tupleSize;
    orders.push({
      orderId: readWord(data, base),
      price: readWord(data, base + 1),
      quantity: readWord(data, base + 2),
      filled: readWord(data, base + 3),
      timestamp: readWord(data, base + 4),
      side: readWord(data, base + 5),
    });
  }

  return orders;
}

function decodeString(data: string) {
  const [value] = decodeAbiParameters([{ type: "string" }], data as `0x${string}`);
  return value;
}

function aggregateLevels(
  orders: Array<{
    price: bigint;
    quantity: bigint;
    filled: bigint;
  }>,
): OrderBookLevel[] {
  const levels = new Map<string, OrderBookLevel>();

  for (const order of orders) {
    const openQuantity = order.quantity - order.filled;
    if (openQuantity <= 0n) {
      continue;
    }

    const key = order.price.toString();
    const existing = levels.get(key);
    if (existing) {
      existing.quantity += openQuantity;
      existing.orderCount += 1;
      continue;
    }

    levels.set(key, {
      price: order.price,
      quantity: openQuantity,
      orderCount: 1,
    });
  }

  return [...levels.values()];
}

async function loadMarketState() {
  const bidDepth = BigInt(DEPLOYED_MARKET.depth);

  const [
    baseSymbolData,
    quoteSymbolData,
    topOfBookData,
    bidOrdersData,
    askOrdersData,
    minOrderQuantityData,
    minOrderNotionalData,
    tradingEnabledData,
  ] = await Promise.all([
    ethCall(DEPLOYED_MARKET.baseToken, SELECTORS.symbol),
    ethCall(DEPLOYED_MARKET.quoteToken, SELECTORS.symbol),
    ethCall(DEPLOYED_MARKET.address, SELECTORS.getTopOfBook),
    ethCall(
      DEPLOYED_MARKET.address,
      `${SELECTORS.getTopOrders}${encodeUint256(0n)}${encodeUint256(bidDepth)}`,
    ),
    ethCall(
      DEPLOYED_MARKET.address,
      `${SELECTORS.getTopOrders}${encodeUint256(1n)}${encodeUint256(bidDepth)}`,
    ),
    ethCall(DEPLOYED_MARKET.address, SELECTORS.minOrderQuantity),
    ethCall(DEPLOYED_MARKET.address, SELECTORS.minOrderNotional),
    ethCall(DEPLOYED_MARKET.address, SELECTORS.tradingEnabled),
  ]);

  const topOfBook = decodeTopOfBook(topOfBookData);
  const bids = aggregateLevels(decodeTopOrders(bidOrdersData));
  const asks = aggregateLevels(decodeTopOrders(askOrdersData));

  return {
    baseSymbol: decodeString(baseSymbolData),
    quoteSymbol: decodeString(quoteSymbolData),
    topOfBook,
    bids,
    asks,
    minOrderQuantity: decodeUint128(minOrderQuantityData),
    minOrderNotional: decodeUint128(minOrderNotionalData),
    tradingEnabled: decodeBool(tradingEnabledData),
  };
}

export async function listMarkets(): Promise<MarketSummary[]> {
  const marketState = await loadMarketState();
  const symbol = `${marketState.baseSymbol} / ${marketState.quoteSymbol}`;

  return [
    {
      address: DEPLOYED_MARKET.address,
      symbol,
      baseSymbol: marketState.baseSymbol,
      quoteSymbol: marketState.quoteSymbol,
      enabled: marketState.tradingEnabled,
      topOfBook: marketState.topOfBook,
    },
  ];
}

export async function getMarketByAddress(
  pairAddress: string,
): Promise<MarketDetail | null> {
  if (pairAddress.toLowerCase() !== DEPLOYED_MARKET.address.toLowerCase()) {
    return null;
  }

  const marketState = await loadMarketState();
  const symbol = `${marketState.baseSymbol} / ${marketState.quoteSymbol}`;

  return {
    address: DEPLOYED_MARKET.address,
    symbol,
    baseSymbol: marketState.baseSymbol,
    quoteSymbol: marketState.quoteSymbol,
    enabled: marketState.tradingEnabled,
    depth: DEPLOYED_MARKET.depth,
    minOrderQuantity: marketState.minOrderQuantity,
    minOrderNotional: marketState.minOrderNotional,
    topOfBook: marketState.topOfBook,
    bids: marketState.bids,
    asks: marketState.asks,
    quote: {
      status: 0,
      tradeCount: 0,
      consumedBidCount: 0,
      consumedAskCount: 0,
      executedBaseQuantity: 0n,
      executedQuoteQuantity: 0n,
    },
    portfolio: EMPTY_PORTFOLIO,
  };
}

export async function getPortfolioSnapshot(): Promise<PortfolioSnapshot> {
  return EMPTY_PORTFOLIO;
}
