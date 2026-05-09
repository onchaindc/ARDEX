"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  BadgeDollarSign,
  CandlestickChart,
  CheckCircle2,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  XCircle
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { encryptPosition, decryptPosition, runPrivateLiquidationCheck } from "@/lib/arcium/client";
import { getAllOraclePrices } from "@/lib/pyth/prices";
import {
  applySpread,
  calculateLiquidationPrice,
  calculateMarginRatio,
  calculatePnl,
  formatUsd
} from "@/lib/protocol/math";
import type {
  EncryptedPositionRecord,
  MarketSymbol,
  PlainPosition,
  PnlPoint,
  PositionSide,
  VisiblePosition
} from "@/lib/protocol/types";
import { shortenAddress } from "@/lib/solana/program";

const MARKETS: MarketSymbol[] = ["SOL", "BTC"];
const SIDES: PositionSide[] = ["long", "short"];
const LEVERAGES = [1, 2, 3, 4, 5];

type LocalLedger = {
  collateralUsd: number;
  encryptedPositions: EncryptedPositionRecord[];
  pnlHistory: PnlPoint[];
};

const emptyLedger: LocalLedger = {
  collateralUsd: 0,
  encryptedPositions: [],
  pnlHistory: []
};

export function ExchangeTerminal() {
  const { publicKey, connected } = useWallet();
  const owner = publicKey?.toBase58();
  const [market, setMarket] = useState<MarketSymbol>("SOL");
  const [side, setSide] = useState<PositionSide>("long");
  const [leverage, setLeverage] = useState(3);
  const [collateralInput, setCollateralInput] = useState(250);
  const [depositInput, setDepositInput] = useState(1000);
  const [ledger, setLedger] = useState<LocalLedger>(emptyLedger);
  const [prices, setPrices] = useState<Record<MarketSymbol, number>>({ SOL: 148.42, BTC: 64250 });
  const [visiblePosition, setVisiblePosition] = useState<VisiblePosition | null>(null);
  const [activity, setActivity] = useState("Connect a Solana wallet to start.");
  const [busy, setBusy] = useState(false);

  const storageKey = useMemo(() => (owner ? `ardex:v1:${owner}` : null), [owner]);
  const openRecord = ledger.encryptedPositions.find((position) => position.status === "open");
  const entryPrice = applySpread(prices[market], side);
  const buyingPower = ledger.collateralUsd * leverage;

  useEffect(() => {
    if (!storageKey) {
      setLedger(emptyLedger);
      setVisiblePosition(null);
      return;
    }

    const stored = window.localStorage.getItem(storageKey);
    setLedger(stored ? (JSON.parse(stored) as LocalLedger) : emptyLedger);
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) {
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(ledger));
  }, [ledger, storageKey]);

  useEffect(() => {
    let mounted = true;

    async function refreshPrices() {
      const nextPrices = await getAllOraclePrices();
      if (mounted) {
        setPrices(nextPrices);
      }
    }

    refreshPrices();
    const id = window.setInterval(refreshPrices, 4_000);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  const refreshVisiblePosition = useCallback(async () => {
    if (!owner || !openRecord) {
      setVisiblePosition(null);
      return;
    }

    const decrypted = await decryptPosition(owner, openRecord);
    const markPriceUsd = prices[decrypted.market];
    const pnlUsd = calculatePnl(decrypted, markPriceUsd);
    const nextVisible: VisiblePosition = {
      ...decrypted,
      status: openRecord.status,
      markPriceUsd,
      pnlUsd,
      liquidationPriceUsd: calculateLiquidationPrice(decrypted),
      marginRatio: calculateMarginRatio(decrypted, markPriceUsd)
    };

    setVisiblePosition(nextVisible);
    setLedger((current) => ({
      ...current,
      pnlHistory: [...current.pnlHistory.slice(-23), { at: Date.now(), valueUsd: pnlUsd }]
    }));
  }, [openRecord, owner, prices]);

  useEffect(() => {
    refreshVisiblePosition();
  }, [refreshVisiblePosition]);

  function depositCollateral() {
    if (!connected || !owner) {
      setActivity("Wallet required before USDC deposit.");
      return;
    }

    const amount = Math.max(0, Number(depositInput) || 0);
    setLedger((current) => ({ ...current, collateralUsd: current.collateralUsd + amount }));
    setActivity(`${formatUsd(amount)} USDC collateral credited to the devnet vault.`);
  }

  async function openPosition() {
    if (!owner) {
      setActivity("Connect wallet first.");
      return;
    }

    if (openRecord) {
      setActivity("MVP supports one open position per wallet.");
      return;
    }

    if (collateralInput <= 0 || collateralInput > ledger.collateralUsd) {
      setActivity("Collateral must be available in the vault.");
      return;
    }

    setBusy(true);
    try {
      const position: PlainPosition = {
        id: crypto.randomUUID(),
        owner,
        market,
        side,
        collateralUsd: collateralInput,
        leverage,
        entryPriceUsd: entryPrice,
        openedAt: Date.now()
      };
      const encrypted = await encryptPosition(position);

      setLedger((current) => ({
        collateralUsd: current.collateralUsd - collateralInput,
        encryptedPositions: [encrypted, ...current.encryptedPositions],
        pnlHistory: []
      }));
      setActivity("Encrypted position stored with PDA metadata.");
    } finally {
      setBusy(false);
    }
  }

  async function checkLiquidation() {
    if (!owner || !openRecord) {
      return;
    }

    const price = prices[openRecord.market];
    const result = await runPrivateLiquidationCheck(owner, openRecord, price);
    setLedger((current) => ({
      ...current,
      encryptedPositions: current.encryptedPositions.map((record) =>
        record.id === openRecord.id && result.liquidatable
          ? { ...record, status: "liquidatable" }
          : record
      )
    }));
    setActivity(
      result.liquidatable
        ? "Private liquidation check flagged this position."
        : "Private liquidation check passed."
    );
  }

  async function closePosition() {
    if (!owner || !openRecord) {
      return;
    }

    setBusy(true);
    try {
      const decrypted = await decryptPosition(owner, openRecord);
      const pnlUsd = calculatePnl(decrypted, prices[decrypted.market]);
      const settlement = Math.max(0, decrypted.collateralUsd + pnlUsd);

      setLedger((current) => ({
        collateralUsd: current.collateralUsd + settlement,
        encryptedPositions: current.encryptedPositions.map((record) =>
          record.id === openRecord.id ? { ...record, status: "closed" } : record
        ),
        pnlHistory: [...current.pnlHistory, { at: Date.now(), valueUsd: pnlUsd }]
      }));
      setVisiblePosition(null);
      setActivity(`Position closed. Settlement: ${formatUsd(settlement)} USDC.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brandMark">A</div>
          <div>
            <h1>ARDEX</h1>
            <p>Private perpetual futures on Solana + Arcium</p>
          </div>
        </div>
        <WalletMultiButton />
      </header>

      <section className="marketStrip" aria-label="Markets">
        {MARKETS.map((symbol) => (
          <button
            className={market === symbol ? "marketTile active" : "marketTile"}
            key={symbol}
            onClick={() => setMarket(symbol)}
            type="button"
          >
            <span>{symbol}-PERP</span>
            <strong>{formatUsd(prices[symbol])}</strong>
          </button>
        ))}
      </section>

      <section className="grid">
        <div className="terminal panel">
          <div className="panelTitle">
            <CandlestickChart size={19} />
            <span>Open Position</span>
          </div>

          <div className="fieldRow">
            <label>Market</label>
            <div className="segmented">
              {MARKETS.map((symbol) => (
                <button
                  className={market === symbol ? "selected" : ""}
                  key={symbol}
                  onClick={() => setMarket(symbol)}
                  type="button"
                >
                  {symbol}
                </button>
              ))}
            </div>
          </div>

          <div className="fieldRow">
            <label>Direction</label>
            <div className="segmented">
              {SIDES.map((nextSide) => (
                <button
                  className={side === nextSide ? "selected" : ""}
                  key={nextSide}
                  onClick={() => setSide(nextSide)}
                  type="button"
                >
                  {nextSide.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="fieldRow">
            <label>Leverage</label>
            <div className="leverageGrid">
              {LEVERAGES.map((value) => (
                <button
                  className={leverage === value ? "selected" : ""}
                  key={value}
                  onClick={() => setLeverage(value)}
                  type="button"
                >
                  {value}x
                </button>
              ))}
            </div>
          </div>

          <div className="inputGrid">
            <label>
              <span>USDC Collateral</span>
              <input
                min={0}
                onChange={(event) => setCollateralInput(Number(event.target.value))}
                type="number"
                value={collateralInput}
              />
            </label>
            <label>
              <span>Deposit USDC</span>
              <input
                min={0}
                onChange={(event) => setDepositInput(Number(event.target.value))}
                type="number"
                value={depositInput}
              />
            </label>
          </div>

          <div className="quoteGrid">
            <Metric label="Entry" value={formatUsd(entryPrice)} />
            <Metric label="Buying Power" value={formatUsd(buyingPower)} />
            <Metric label="Vault Balance" value={formatUsd(ledger.collateralUsd)} />
          </div>

          <div className="actions">
            <button className="ghostButton" onClick={depositCollateral} type="button">
              <ArrowDownToLine size={18} />
              Deposit
            </button>
            <button className="primaryButton" disabled={busy || !connected} onClick={openPosition} type="button">
              <LockKeyhole size={18} />
              Encrypt & Open
            </button>
          </div>
        </div>

        <div className="panel privacyPanel">
          <div className="panelTitle">
            <ShieldCheck size={19} />
            <span>Private State</span>
          </div>
          <div className="privacyStack">
            <PrivacyLine icon={<EyeOff size={18} />} label="Hidden" value="Entry, size, leverage, collateral" />
            <PrivacyLine icon={<LockKeyhole size={18} />} label="Encrypted" value="Arcium payload + PDA commitment" />
            <PrivacyLine icon={<Activity size={18} />} label="Liquidation" value="Checked against private oracle input" />
          </div>
          <div className="statusBox">
            <span>{owner ? shortenAddress(owner) : "Wallet not connected"}</span>
            <strong>{activity}</strong>
          </div>
        </div>

        <div className="dashboard">
          <div className="panel positionPanel">
            <div className="panelTitle">
              <BadgeDollarSign size={19} />
              <span>Your Position</span>
            </div>
            {visiblePosition ? (
              <div className="positionBody">
                <div className="positionHead">
                  <div>
                    <span>{visiblePosition.market}-PERP</span>
                    <strong>{visiblePosition.side.toUpperCase()} {visiblePosition.leverage}x</strong>
                  </div>
                  <StatusPill status={visiblePosition.status} />
                </div>
                <div className="quoteGrid dense">
                  <Metric label="Mark" value={formatUsd(visiblePosition.markPriceUsd)} />
                  <Metric
                    label="PnL"
                    tone={visiblePosition.pnlUsd >= 0 ? "good" : "bad"}
                    value={formatUsd(visiblePosition.pnlUsd)}
                  />
                  <Metric label="Liq." value={formatUsd(visiblePosition.liquidationPriceUsd)} />
                  <Metric label="Margin" value={`${(visiblePosition.marginRatio * 100).toFixed(1)}%`} />
                </div>
                <div className="actions compact">
                  <button className="ghostButton" onClick={checkLiquidation} type="button">
                    <CheckCircle2 size={18} />
                    Check
                  </button>
                  <button className="dangerButton" disabled={busy} onClick={closePosition} type="button">
                    <XCircle size={18} />
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div className="emptyState">
                <ArrowUpRight size={20} />
                <span>No open private position</span>
              </div>
            )}
          </div>

          <div className="panel historyPanel">
            <div className="panelTitle">
              <Activity size={19} />
              <span>PnL History</span>
            </div>
            <div className="sparkline" aria-label="PnL history chart">
              {ledger.pnlHistory.length > 0 ? (
                ledger.pnlHistory.map((point, index) => (
                  <span
                    className={point.valueUsd >= 0 ? "bar positive" : "bar negative"}
                    key={`${point.at}-${index}`}
                    style={{ height: `${Math.min(92, 18 + Math.abs(point.valueUsd) / 3)}%` }}
                    title={formatUsd(point.valueUsd)}
                  />
                ))
              ) : (
                <span className="historyEmpty">Encrypted PnL appears after a position opens</span>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={tone === "good" ? "good" : tone === "bad" ? "bad" : ""}>{value}</strong>
    </div>
  );
}

function PrivacyLine({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="privacyLine">
      {icon}
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  return <span className={`statusPill ${status}`}>{status}</span>;
}
