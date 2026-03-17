const DECIMALS = 18n;
const SCALE = 10n ** DECIMALS;

export function formatTokenAmount(value: bigint, decimals = Number(DECIMALS)) {
  const negative = value < 0n;
  const absolute = negative ? value * -1n : value;
  const whole = absolute / SCALE;
  const fraction = absolute % SCALE;
  const fractionDigits = Number(10n ** BigInt(18 - Math.min(decimals, 18)));
  const trimmedFraction = Number(fraction / BigInt(fractionDigits))
    .toString()
    .padStart(Math.min(decimals, 18), "0")
    .replace(/0+$/, "")
    .slice(0, 4);

  const wholeString = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const prefix = negative ? "-" : "";
  return trimmedFraction
    ? `${prefix}${wholeString}.${trimmedFraction}`
    : `${prefix}${wholeString}`;
}

export function formatCompactNumber(value: bigint) {
  const asNumber = Number(value / SCALE);
  if (asNumber >= 1_000_000) {
    return `${(asNumber / 1_000_000).toFixed(1)}M`;
  }
  if (asNumber >= 1_000) {
    return `${(asNumber / 1_000).toFixed(1)}K`;
  }
  return asNumber.toFixed(0);
}

export function formatPercentSpread(bid: bigint, ask: bigint) {
  if (bid === 0n || ask === 0n || ask <= bid) {
    return "0.00%";
  }
  const spreadBps = Number(((ask - bid) * 10_000n) / ask);
  return `${(spreadBps / 100).toFixed(2)}%`;
}

export function parseTokenAmount(value: string, decimals = Number(DECIMALS)) {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0n;
  }

  const negative = trimmed.startsWith("-");
  const normalized = negative ? trimmed.slice(1) : trimmed;
  const [wholePart, fractionPart = ""] = normalized.split(".");

  if (!/^\d+$/.test(wholePart || "0") || !/^\d*$/.test(fractionPart)) {
    throw new Error("Invalid numeric input");
  }

  const sanitizedWhole = wholePart.length === 0 ? "0" : wholePart;
  const paddedFraction = (fractionPart + "0".repeat(decimals)).slice(0, decimals);
  const whole = BigInt(sanitizedWhole) * 10n ** BigInt(decimals);
  const fraction = BigInt(paddedFraction || "0");
  const amount = whole + fraction;

  return negative ? amount * -1n : amount;
}
