//! ARDEX private liquidation compute sketch.
//!
//! The browser MVP uses `lib/arcium/client.ts` as a local adapter so judges can run
//! the flow without a live Arcium cluster. This circuit is the intended encrypted
//! compute boundary for the hackathon deployment.

use arcium::prelude::*;

#[encrypted]
pub struct PrivatePosition {
    pub entry_price_e8: u64,
    pub collateral_usdc: u64,
    pub leverage_x: u8,
    pub side: u8,
}

#[encrypted]
pub struct PrivateOraclePrice {
    pub mark_price_e8: u64,
}

#[encrypted]
pub fn liquidation_check(position: PrivatePosition, oracle: PrivateOraclePrice) -> bool {
    let notional = position.collateral_usdc * position.leverage_x as u64;
    let maintenance_margin = notional * 12 / 100;
    let price_delta = if position.side == 0 {
        oracle.mark_price_e8.saturating_sub(position.entry_price_e8)
    } else {
        position.entry_price_e8.saturating_sub(oracle.mark_price_e8)
    };
    let loss = notional * price_delta / position.entry_price_e8;
    let equity = position.collateral_usdc.saturating_sub(loss);

    equity <= maintenance_margin
}
