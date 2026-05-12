import type { MarketSymbol } from "@/lib/protocol/types";

type PriceMap = Record<MarketSymbol, number>;

const FALLBACK_PRICES: PriceMap = {
  SOL: 148.42,
  BTC: 64250
};

const DEFAULT_HERMES_URL = "https://hermes.pyth.network";
const DEFAULT_FEED_IDS: Record<MarketSymbol, string> = {
  SOL: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  BTC: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43"
};

const FEED_ENV: Record<MarketSymbol, string | undefined> = {
  SOL: process.env.NEXT_PUBLIC_PYTH_SOL_USD_FEED_ID,
  BTC: process.env.NEXT_PUBLIC_PYTH_BTC_USD_FEED_ID
};

export async function getOraclePrice(symbol: MarketSymbol): Promise<number> {
  const hermesUrl = process.env.NEXT_PUBLIC_PYTH_HERMES_URL ?? DEFAULT_HERMES_URL;
  const feedId = FEED_ENV[symbol] ?? DEFAULT_FEED_IDS[symbol];

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
