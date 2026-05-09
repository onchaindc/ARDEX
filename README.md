# ARDEX

ARDEX is a hackathon MVP for private perpetual futures on Solana with Arcium-style encrypted position state.

The core product flow is intentionally simple: deposit devnet USDC collateral, open one isolated SOL/BTC long or short at 1-5x leverage, encrypt the sensitive position payload, store only opaque commitments in a Solana PDA, run private liquidation checks, then close and settle PnL.

Private Perp DEX: positions, entry prices, liquidation levels, and PnL are encrypted and hidden from MEV bots, liquidation hunters, and other traders.

## What Is Built

- Next.js 14 app router frontend with a trader terminal and private dashboard.
- Solana wallet connection through Solana Wallet Adapter for Phantom and Solflare.
- Anchor program scaffold with user vault PDAs and encrypted position PDAs.
- Arcium adapter that dynamically loads `@arcium-hq/client` and falls back to browser AES-GCM for local judging.
- Pyth Hermes price adapter with deterministic simulated fallback prices when feed IDs are not configured.
- Private liquidation compute sketch in `arcium/private_liquidation.arcis.rs`.

## Privacy Model

Visible on-chain:

- Owner wallet
- Market enum
- Collateral amount reserved for vault accounting
- Encrypted payload bytes
- Nonce
- Side/leverage commitment
- Oracle/liquidation commitment
- Position status

Hidden from public mempool observers:

- Direction
- Entry price
- Leverage
- Full collateral and notional details inside encrypted payload
- Live PnL
- Liquidation threshold

The MVP frontend stores encrypted demo payloads locally while the Anchor program models the devnet PDA layout. For a live Arcium deployment, replace the AES fallback in `lib/arcium/client.ts` with the Arcium encrypted computation output and submit the encrypted payload to `open_encrypted_position`.

## Getting Started

```bash
cd ARDEX
npm install
npm run dev
```

Open `http://localhost:3000`, connect a devnet Solana wallet, deposit demo USDC collateral, and open one private position.

## Devnet Configuration

Create `.env.local`:

```bash
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_ARDEX_PROGRAM_ID=<deployed program id>
NEXT_PUBLIC_USDC_MINT_DEVNET=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
NEXT_PUBLIC_PYTH_HERMES_URL=https://hermes.pyth.network
NEXT_PUBLIC_PYTH_SOL_USD_FEED_ID=<pyth sol/usd feed id>
NEXT_PUBLIC_PYTH_BTC_USD_FEED_ID=<pyth btc/usd feed id>
```

Without Pyth feed IDs, the UI uses moving fallback prices so the demo still works offline.

## Anchor

```bash
anchor build
anchor test
anchor deploy --provider.cluster devnet
```

After deploy:

1. Update `declare_id!` in `programs/ardex/src/lib.rs`.
2. Update `[programs.devnet]` in `Anchor.toml`.
3. Add the same program ID to `.env.local` as `NEXT_PUBLIC_ARDEX_PROGRAM_ID`.

## Notes

Wagmi and RainbowKit are EVM wallet tools, so ARDEX uses Solana Wallet Adapter for the actual Solana wallet connection. The rest of the requested stack is represented directly: Next.js 14, Anchor, Solana, Arcium SDK adapter, and Pyth price feeds.
