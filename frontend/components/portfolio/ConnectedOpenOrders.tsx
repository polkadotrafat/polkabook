"use client";

import { useEffect, useState } from "react";
import { parseAbi } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";

import { removeTrackedOrderId, loadTrackedOrderIds } from "@/lib/orderTracking";
import { formatTokenAmount } from "@/lib/format/units";
import type { TrackedOrder } from "@/lib/types/market";
import { onPolkaBookRefresh } from "@/lib/uiSync";
import { polkadotHubPaseo } from "@/lib/wallet/config";

const orderBookAbi = parseAbi([
  "function orders(uint64 orderId) view returns (uint64 orderIdOut, address trader, uint128 price, uint128 quantity, uint128 filled, uint64 timestamp, uint8 side, uint128 reservedAmount, bool isActive)",
  "function cancelOrder(uint64 orderId)",
]);

type ConnectedOpenOrdersProps = {
  marketAddress: `0x${string}`;
};

export function ConnectedOpenOrders({ marketAddress }: ConnectedOpenOrdersProps) {
  const publicClient = usePublicClient();
  const { address, isConnected, chainId } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [orders, setOrders] = useState<TrackedOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState<bigint | null>(null);
  const [message, setMessage] = useState("");
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    return onPolkaBookRefresh(() => setRefreshNonce((value) => value + 1));
  }, []);

  useEffect(() => {
    async function load() {
      if (!address || !publicClient) {
        setOrders([]);
        return;
      }

      const trackedOrderIds = loadTrackedOrderIds(address, marketAddress);
      if (trackedOrderIds.length === 0) {
        setOrders([]);
        return;
      }

      setLoading(true);
      try {
        const results = await Promise.all(
          trackedOrderIds.map(async (orderId) => {
            try {
              const result = await publicClient.readContract({
                address: marketAddress,
                abi: orderBookAbi,
                functionName: "orders",
                args: [orderId],
              });
              return { status: "success", result };
            } catch (error) {
              return { status: "failure", error };
            }
          })
        );

        const nextOrders: TrackedOrder[] = [];
        for (let i = 0; i < results.length; i += 1) {
          const result = results[i];
          const trackedOrderId = trackedOrderIds[i];

          if (result.status !== "success" || !result.result) {
            continue;
          }

          const record = result.result as readonly [
            bigint,
            `0x${string}`,
            bigint,
            bigint,
            bigint,
            bigint,
            number,
            bigint,
            boolean,
          ];
          const trader = record[1];
          const price = record[2];
          const quantity = record[3];
          const filled = record[4];
          const side = record[6];
          const isActive = record[8];

          if (trader.toLowerCase() !== address.toLowerCase()) {
            continue;
          }

          if (!isActive && filled >= quantity) {
            removeTrackedOrderId(address, marketAddress, trackedOrderId);
            continue;
          }

          nextOrders.push({
            orderId: trackedOrderId,
            side: side === 0 ? "Bid" : "Ask",
            price,
            quantity,
            filled,
            status: isActive ? "Resting" : "Inactive",
          });
        }

        setOrders(nextOrders);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [address, marketAddress, publicClient, refreshNonce]);

  async function cancel(orderId: bigint) {
    if (!publicClient || !address || chainId !== polkadotHubPaseo.id) {
      return;
    }

    setBusyOrderId(orderId);
    setMessage("");

    try {
      const hash = await writeContractAsync({
        address: marketAddress,
        abi: orderBookAbi,
        functionName: "cancelOrder",
        args: [orderId],
        chainId: polkadotHubPaseo.id,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      removeTrackedOrderId(address, marketAddress, orderId);
      setOrders((current) => current.filter((order) => order.orderId !== orderId));
      setMessage(`Cancelled order #${orderId.toString()}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cancel failed");
    } finally {
      setBusyOrderId(null);
    }
  }

  if (!isConnected || !address) {
    return (
      <div className="rounded-[20px] border border-dashed border-[var(--edge)] bg-white/40 px-4 py-6 text-sm text-[var(--ink-soft)]">
        Connect MetaMask to track and cancel your open orders.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-[20px] border border-dashed border-[var(--edge)] bg-white/40 px-4 py-6 text-sm text-[var(--ink-soft)]">
        Loading tracked open orders.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[20px] border border-[var(--edge)] bg-white/55">
      <div className="grid grid-cols-[0.7fr_0.9fr_1fr_1fr_0.9fr_0.8fr] gap-4 border-b border-[var(--edge)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
        <span>Side</span>
        <span>Order</span>
        <span>Price</span>
        <span>Quantity</span>
        <span>Status</span>
        <span>Action</span>
      </div>
      <div className="divide-y divide-[var(--edge)]">
        {orders.length === 0 ? (
          <div className="px-4 py-6 text-sm text-[var(--ink-soft)]">
            No tracked open orders for the connected wallet.
          </div>
        ) : null}

        {orders.map((order) => (
          <div
            key={order.orderId.toString()}
            className="grid grid-cols-[0.7fr_0.9fr_1fr_1fr_0.9fr_0.8fr] gap-4 px-4 py-4 text-sm"
          >
            <span
              className={
                order.side === "Bid"
                  ? "font-semibold text-[var(--positive)]"
                  : "font-semibold text-[var(--negative)]"
              }
            >
              {order.side}
            </span>
            <span className="mono text-[var(--ink-soft)]">#{order.orderId.toString()}</span>
            <span className="mono text-[var(--ink-soft)]">
              {formatTokenAmount(order.price)}
            </span>
            <span className="mono text-[var(--ink-soft)]">
              {formatTokenAmount(order.quantity - order.filled)} /{" "}
              {formatTokenAmount(order.quantity)}
            </span>
            <span className="text-[var(--ink-strong)]">{order.status}</span>
            <button
              className="button-secondary min-h-0 px-3 py-2 text-xs"
              disabled={busyOrderId !== null || order.status !== "Resting"}
              onClick={() => cancel(order.orderId)}
              type="button"
            >
              {busyOrderId === order.orderId ? "Cancelling..." : "Cancel"}
            </button>
          </div>
        ))}
      </div>
      {message ? <div className="border-t border-[var(--edge)] px-4 py-3 text-sm text-[var(--ink-soft)]">{message}</div> : null}
    </div>
  );
}
