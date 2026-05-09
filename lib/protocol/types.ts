export type MarketSymbol = "SOL" | "BTC";
export type PositionSide = "long" | "short";
export type PositionStatus = "open" | "closed" | "liquidatable";

export type PlainPosition = {
  id: string;
  owner: string;
  market: MarketSymbol;
  side: PositionSide;
  collateralUsd: number;
  leverage: number;
  entryPriceUsd: number;
  openedAt: number;
};

export type EncryptedPositionRecord = {
  id: string;
  owner: string;
  market: MarketSymbol;
  sideCommitment: string;
  encryptedPayload: string;
  nonce: string;
  positionPda: string;
  openedAt: number;
  status: PositionStatus;
};

export type VisiblePosition = PlainPosition & {
  status: PositionStatus;
  markPriceUsd: number;
  pnlUsd: number;
  liquidationPriceUsd: number;
  marginRatio: number;
};

export type PnlPoint = {
  at: number;
  valueUsd: number;
};
