"use client";

const PREFIX = "polkabook:orders";

export function getTrackedOrdersKey(account: string, marketAddress: string) {
  return `${PREFIX}:${account.toLowerCase()}:${marketAddress.toLowerCase()}`;
}

export function loadTrackedOrderIds(account: string, marketAddress: string): bigint[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(getTrackedOrdersKey(account, marketAddress));
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as string[];
    return parsed.map((value) => BigInt(value));
  } catch {
    return [];
  }
}

export function saveTrackedOrderIds(account: string, marketAddress: string, orderIds: bigint[]) {
  if (typeof window === "undefined") {
    return;
  }

  const unique = [...new Set(orderIds.map((id) => id.toString()))];
  window.localStorage.setItem(
    getTrackedOrdersKey(account, marketAddress),
    JSON.stringify(unique),
  );
}

export function addTrackedOrderId(account: string, marketAddress: string, orderId: bigint) {
  const existing = loadTrackedOrderIds(account, marketAddress);
  existing.push(orderId);
  saveTrackedOrderIds(account, marketAddress, existing);
}

export function removeTrackedOrderId(account: string, marketAddress: string, orderId: bigint) {
  const next = loadTrackedOrderIds(account, marketAddress).filter((value) => value !== orderId);
  saveTrackedOrderIds(account, marketAddress, next);
}
