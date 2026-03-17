export type TopOfBook = {
  bestBidPrice: bigint;
  bestBidQuantity: bigint;
  bestAskPrice: bigint;
  bestAskQuantity: bigint;
  crossed: boolean;
};

export type OrderBookLevel = {
  price: bigint;
  quantity: bigint;
  orderCount: number;
};

export type QuoteSummary = {
  status: number;
  tradeCount: number;
  consumedBidCount: number;
  consumedAskCount: number;
  executedBaseQuantity: bigint;
  executedQuoteQuantity: bigint;
};

export type PortfolioBalance = {
  symbol: string;
  available: bigint;
  locked: bigint;
};

export type TrackedOrder = {
  orderId: bigint;
  side: "Bid" | "Ask";
  price: bigint;
  quantity: bigint;
  filled: bigint;
  status: string;
};

export type PortfolioSnapshot = {
  balances: PortfolioBalance[];
  openOrders: TrackedOrder[];
};

export type MarketSummary = {
  address: string;
  symbol: string;
  baseSymbol: string;
  quoteSymbol: string;
  enabled: boolean;
  topOfBook: TopOfBook;
};

export type MarketDetail = MarketSummary & {
  depth: number;
  minOrderQuantity: bigint;
  minOrderNotional: bigint;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  quote: QuoteSummary;
  portfolio: PortfolioSnapshot;
};
