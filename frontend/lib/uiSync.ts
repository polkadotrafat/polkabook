"use client";

const POLKABOOK_REFRESH_EVENT = "polkabook:refresh";

export function emitPolkaBookRefresh() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(POLKABOOK_REFRESH_EVENT));
}

export function onPolkaBookRefresh(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = () => callback();
  window.addEventListener(POLKABOOK_REFRESH_EVENT, handler);
  return () => window.removeEventListener(POLKABOOK_REFRESH_EVENT, handler);
}
