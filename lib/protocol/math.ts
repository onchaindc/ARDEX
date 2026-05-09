import type { PlainPosition, PositionSide } from "./types";

const MAINTENANCE_MARGIN_RATIO = 0.12;
const FIXED_SPREAD_BPS = 8;

export function applySpread(priceUsd: number, side: PositionSide): number {
  const spread = priceUsd * (FIXED_SPREAD_BPS / 10_000);
  return side === "long" ? priceUsd + spread : priceUsd - spread;
}

export function calculatePnl(position: PlainPosition, markPriceUsd: number): number {
  const notional = position.collateralUsd * position.leverage;
  const priceDelta =
    position.side === "long"
      ? markPriceUsd - position.entryPriceUsd
      : position.entryPriceUsd - markPriceUsd;

  return (priceDelta / position.entryPriceUsd) * notional;
}

export function calculateLiquidationPrice(position: PlainPosition): number {
  const lossToLiquidation = position.collateralUsd * (1 - MAINTENANCE_MARGIN_RATIO);
  const notional = position.collateralUsd * position.leverage;
  const priceMoveRatio = lossToLiquidation / notional;

  if (position.side === "long") {
    return position.entryPriceUsd * (1 - priceMoveRatio);
  }

  return position.entryPriceUsd * (1 + priceMoveRatio);
}

export function calculateMarginRatio(position: PlainPosition, markPriceUsd: number): number {
  const notional = position.collateralUsd * position.leverage;
  const equity = position.collateralUsd + calculatePnl(position, markPriceUsd);
  return Math.max(0, equity / notional);
}

export function isLiquidatable(position: PlainPosition, markPriceUsd: number): boolean {
  return calculateMarginRatio(position, markPriceUsd) <= MAINTENANCE_MARGIN_RATIO;
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2
  }).format(value);
}
