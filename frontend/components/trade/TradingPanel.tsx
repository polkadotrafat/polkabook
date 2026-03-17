"use client";

import { useEffect, useMemo, useState } from "react";
import { decodeEventLog, parseAbi, parseAbiItem } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";

import { addTrackedOrderId } from "@/lib/orderTracking";
import { formatTokenAmount, parseTokenAmount } from "@/lib/format/units";
import type { MarketDetail } from "@/lib/types/market";
import { emitPolkaBookRefresh } from "@/lib/uiSync";
import { polkadotHubPaseo } from "@/lib/wallet/config";

const orderBookAbi = parseAbi([
  "function placeOrder(uint128 price, uint128 quantity, uint8 side) returns (uint64)",
  "function quoteOrder(uint128 price, uint128 quantity, uint8 side) view returns ((uint8 status, uint32 tradeCount, uint32 consumedBidCount, uint32 consumedAskCount, uint128 executedBaseQuantity, uint128 executedQuoteQuantity, (uint64 bidOrderId, uint64 askOrderId, uint128 price, uint128 quantity)[] trades))",
]);

const orderPlacedEvent = parseAbiItem(
  "event OrderPlaced(uint64 indexed orderId, address indexed trader, uint8 indexed side, uint128 price, uint128 quantity)",
);

type TradingPanelProps = {
  market: MarketDetail;
};

type QuoteState = {
  status: number;
  tradeCount: number;
  consumedBidCount: number;
  consumedAskCount: number;
  executedBaseQuantity: bigint;
  executedQuoteQuantity: bigint;
};

const EMPTY_QUOTE: QuoteState = {
  status: 0,
  tradeCount: 0,
  consumedBidCount: 0,
  consumedAskCount: 0,
  executedBaseQuantity: 0n,
  executedQuoteQuantity: 0n,
};

export function TradingPanel({ market }: TradingPanelProps) {
  const publicClient = usePublicClient();
  const { address, isConnected, chainId } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [side, setSide] = useState<0 | 1>(0);
  const [priceInput, setPriceInput] = useState(
    market.topOfBook.bestAskPrice > 0n
      ? formatTokenAmount(market.topOfBook.bestAskPrice)
      : "",
  );
  const [quantityInput, setQuantityInput] = useState("");
  const [quote, setQuote] = useState<QuoteState>(EMPTY_QUOTE);
  const [quoteMessage, setQuoteMessage] = useState("");
  const [txMessage, setTxMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const parsedPrice = useMemo(() => {
    try {
      return parseTokenAmount(priceInput);
    } catch {
      return null;
    }
  }, [priceInput]);

  const parsedQuantity = useMemo(() => {
    try {
      return parseTokenAmount(quantityInput);
    } catch {
      return null;
    }
  }, [quantityInput]);

  const reserveToken = side === 0 ? market.quoteSymbol : market.baseSymbol;

  useEffect(() => {
    let cancelled = false;

    async function runQuote() {
      if (
        !publicClient ||
        parsedPrice === null ||
        parsedQuantity === null ||
        parsedPrice <= 0n ||
        parsedQuantity <= 0n
      ) {
        setQuote(EMPTY_QUOTE);
        setQuoteMessage("");
        return;
      }

      try {
        const result = await publicClient.readContract({
          address: market.address as `0x${string}`,
          abi: orderBookAbi,
          functionName: "quoteOrder",
          args: [parsedPrice, parsedQuantity, side],
        });

        if (cancelled) {
          return;
        }

        setQuote({
          status: result.status,
          tradeCount: Number(result.tradeCount),
          consumedBidCount: Number(result.consumedBidCount),
          consumedAskCount: Number(result.consumedAskCount),
          executedBaseQuantity: result.executedBaseQuantity,
          executedQuoteQuantity: result.executedQuoteQuantity,
        });
        setQuoteMessage("");
      } catch (error) {
        if (cancelled) {
          return;
        }
        setQuote(EMPTY_QUOTE);
        setQuoteMessage(error instanceof Error ? error.message : "Quote failed");
      }
    }

    runQuote();
    return () => {
      cancelled = true;
    };
  }, [market.address, parsedPrice, parsedQuantity, publicClient, side]);

  const invalidOrder =
    !market.enabled ||
    parsedPrice === null ||
    parsedQuantity === null ||
    parsedPrice <= 0n ||
    parsedQuantity <= 0n ||
    parsedQuantity < market.minOrderQuantity ||
    parsedPrice * parsedQuantity < market.minOrderNotional * 10n ** 18n;

  async function placeOrder() {
    if (
      invalidOrder ||
      !isConnected ||
      !address ||
      chainId !== polkadotHubPaseo.id ||
      !publicClient ||
      parsedPrice === null ||
      parsedQuantity === null
    ) {
      return;
    }

    setSubmitting(true);
    setTxMessage("");

    try {
      const hash = await writeContractAsync({
        address: market.address as `0x${string}`,
        abi: orderBookAbi,
        functionName: "placeOrder",
        args: [parsedPrice, parsedQuantity, side],
        chainId: polkadotHubPaseo.id,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      let placedOrderId: bigint | null = null;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: [orderPlacedEvent],
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === "OrderPlaced") {
            placedOrderId = decoded.args.orderId;
            break;
          }
        } catch {}
      }

      if (placedOrderId !== null) {
        addTrackedOrderId(address, market.address, placedOrderId);
        setTxMessage(`Placed order #${placedOrderId.toString()} successfully.`);
      } else {
        setTxMessage("Order placed successfully.");
      }

      setQuantityInput("");
      emitPolkaBookRefresh();
    } catch (error) {
      setTxMessage(error instanceof Error ? error.message : "Order placement failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel section-block">
      <div className="grid gap-2">
        <span className="eyebrow">Trade</span>
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink-strong)]">
          Place a limit order
        </h2>
        <p className="text-sm leading-7 text-[var(--ink-soft)]">
          Add liquidity by depositing into the vault and placing a resting bid or ask.
        </p>
        {isConnected && address ? (
          <p className="mono text-xs text-[var(--ink-soft)]">
            Connected wallet: {address.slice(0, 6)}...{address.slice(-4)}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4">
        <div className="grid gap-2">
          <label className="text-sm font-medium text-[var(--ink-soft)]">Side</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${side === 0 ? "border-[var(--accent-soft)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--edge)] bg-white/60 text-[var(--ink-soft)]"}`}
              onClick={() => setSide(0)}
              type="button"
            >
              Buy
            </button>
            <button
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${side === 1 ? "border-[var(--accent-soft)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--edge)] bg-white/60 text-[var(--ink-soft)]"}`}
              onClick={() => setSide(1)}
              type="button"
            >
              Sell
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <label className="text-sm font-medium text-[var(--ink-soft)]">Price</label>
            <input
              className="rounded-2xl border border-[var(--edge)] bg-white/65 px-4 py-3 text-sm text-[var(--ink-strong)] outline-none focus:border-[var(--accent)]"
              onChange={(event) => setPriceInput(event.target.value)}
              placeholder={`Price in ${market.quoteSymbol}`}
              value={priceInput}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-[var(--ink-soft)]">Quantity</label>
            <input
              className="rounded-2xl border border-[var(--edge)] bg-white/65 px-4 py-3 text-sm text-[var(--ink-strong)] outline-none focus:border-[var(--accent)]"
              onChange={(event) => setQuantityInput(event.target.value)}
              placeholder={`Amount of ${market.baseSymbol}`}
              value={quantityInput}
            />
          </div>
        </div>

        <div className="grid gap-3 rounded-[20px] border border-[var(--edge)] bg-white/60 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--ink-soft)]">Minimum quantity</span>
            <span className="mono text-[var(--ink-strong)]">
              {formatTokenAmount(market.minOrderQuantity)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--ink-soft)]">Minimum notional</span>
            <span className="mono text-[var(--ink-strong)]">
              {formatTokenAmount(market.minOrderNotional)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--ink-soft)]">Reserve token</span>
            <span className="mono text-[var(--ink-strong)]">{reserveToken}</span>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="metric-card">
            <span className="metric-label">Executed base</span>
            <span className="metric-value">{formatTokenAmount(quote.executedBaseQuantity)}</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Executed quote</span>
            <span className="metric-value">{formatTokenAmount(quote.executedQuoteQuantity)}</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Trade count</span>
            <span className="metric-value">{quote.tradeCount}</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Consumed counts</span>
            <span className="metric-value">
              {quote.consumedBidCount}/{quote.consumedAskCount}
            </span>
          </div>
        </div>

        {!market.enabled ? (
          <p className="text-sm text-[var(--negative)]">Trading is disabled for this pair.</p>
        ) : null}
        {!isConnected ? (
          <p className="text-sm text-[var(--ink-soft)]">Connect MetaMask to place orders.</p>
        ) : null}
        {chainId !== undefined && chainId !== polkadotHubPaseo.id ? (
          <p className="text-sm text-[var(--negative)]">
            Switch MetaMask to Polkadot Hub Paseo before trading.
          </p>
        ) : null}
        {quoteMessage ? <p className="text-sm text-[var(--ink-soft)]">{quoteMessage}</p> : null}
        {txMessage ? <p className="text-sm text-[var(--ink-soft)]">{txMessage}</p> : null}

        <button
          className="button-primary w-full"
          disabled={invalidOrder || !isConnected || chainId !== polkadotHubPaseo.id || submitting}
          onClick={placeOrder}
          type="button"
        >
          {submitting ? "Submitting order..." : "Place order"}
        </button>
      </div>
    </section>
  );
}
