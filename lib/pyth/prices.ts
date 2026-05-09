import type { MarketSymbol } from "@/lib/protocol/types";

type PriceMap = Record<MarketSymbol, number>;

const FALLBACK_PRICES: PriceMap = {
  SOL: 148.42,
  BTC: 64250
};

const FEED_ENV: Record<MarketSymbol, string | undefined> = {
  SOL: process.env.NEXT_PUBLIC_PYTH_SOL_USD_FEED_ID,
  BTC: process.env.NEXT_PUBLIC_PYTH_BTC_USD_FEED_ID
};

export async function getOraclePrice(symbol: MarketSymbol): Promise<number> {
  const hermesUrl = process.env.NEXT_PUBLIC_PYTH_HERMES_URL;
  const feedId = FEED_ENV[symbol];

  if (!hermesUrl || !feedId) {
    return simulatePrice(symbol);
  }

  try {
    const response = await fetch(
      `${hermesUrl.replace(/\/$/, "")}/v2/updates/price/latest?ids[]=${feedId}`,
      { cache: "no-store" }
    );
    const payload = (await response.json()) as {
      parsed?: Array<{ price?: { price: string; expo: number } }>;
    };
    const price = payload.parsed?.[0]?.price;

    if (!price) {
      return simulatePrice(symbol);
    }

    return Number(price.price) * 10 ** price.expo;
  } catch {
    return simulatePrice(symbol);
  }
}

export async function getAllOraclePrices(): Promise<PriceMap> {
  const [sol, btc] = await Promise.all([getOraclePrice("SOL"), getOraclePrice("BTC")]);
  return { SOL: sol, BTC: btc };
}

function simulatePrice(symbol: MarketSymbol): number {
  const base = FALLBACK_PRICES[symbol];
  const drift = Math.sin(Date.now() / 38_000 + (symbol === "SOL" ? 0 : 1.7)) * 0.012;
  return Number((base * (1 + drift)).toFixed(symbol === "SOL" ? 2 : 0));
}
