use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("11111111111111111111111111111111");

const MAX_ENCRYPTED_POSITION_BYTES: usize = 1024;

#[program]
pub mod ardex {
    use super::*;

    pub fn initialize_collateral_vault(ctx: Context<InitializeCollateralVault>) -> Result<()> {
        let vault = &mut ctx.accounts.user_vault;
        vault.owner = ctx.accounts.owner.key();
        vault.collateral_deposited = 0;
        vault.reserved_collateral = 0;
        vault.bump = ctx.bumps.user_vault;

        emit!(VaultInitialized {
            owner: vault.owner,
            vault: vault.key()
        });

        Ok(())
    }

    pub fn deposit_collateral(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
        require!(amount > 0, ArdexError::InvalidAmount);

        let transfer_accounts = Transfer {
            from: ctx.accounts.user_usdc_account.to_account_info(),
            to: ctx.accounts.vault_usdc_account.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), transfer_accounts);
        token::transfer(cpi_ctx, amount)?;

        let vault = &mut ctx.accounts.user_vault;
        vault.collateral_deposited = vault
            .collateral_deposited
            .checked_add(amount)
            .ok_or(ArdexError::MathOverflow)?;

        emit!(CollateralDeposited {
            owner: vault.owner,
            amount,
            available: vault.available_collateral()
        });

        Ok(())
    }

    pub fn open_encrypted_position(
        ctx: Context<OpenEncryptedPosition>,
        position_id: [u8; 16],
        market: Market,
        side_commitment: [u8; 32],
        nonce: [u8; 12],
        encrypted_payload: Vec<u8>,
        collateral_amount: u64,
    ) -> Result<()> {
        require!(collateral_amount > 0, ArdexError::InvalidAmount);
        require!(
            encrypted_payload.len() <= MAX_ENCRYPTED_POSITION_BYTES,
            ArdexError::EncryptedPayloadTooLarge
        );
        require!(
            ctx.accounts.user_vault.available_collateral() >= collateral_amount,
            ArdexError::InsufficientCollateral
        );

        let vault = &mut ctx.accounts.user_vault;
        vault.reserved_collateral = vault
            .reserved_collateral
            .checked_add(collateral_amount)
            .ok_or(ArdexError::MathOverflow)?;

        let position = &mut ctx.accounts.position;
        position.owner = ctx.accounts.owner.key();
        position.position_id = position_id;
        position.market = market;
        position.status = PositionStatus::Open;
        position.collateral_amount = collateral_amount;
        position.side_commitment = side_commitment;
        position.oracle_commitment = [0; 32];
        position.nonce = nonce;
        position.encrypted_payload = encrypted_payload;
        position.opened_at = Clock::get()?.unix_timestamp;
        position.updated_at = position.opened_at;
        position.bump = ctx.bumps.position;

        emit!(EncryptedPositionOpened {
            owner: position.owner,
            position: position.key(),
            market,
            side_commitment,
            collateral_amount
        });

        Ok(())
    }

    pub fn mark_liquidation_checked(
        ctx: Context<MarkLiquidationChecked>,
        oracle_commitment: [u8; 32],
        liquidatable: bool,
    ) -> Result<()> {
        let position = &mut ctx.accounts.position;
        require!(position.status == PositionStatus::Open, ArdexError::PositionNotOpen);

        position.oracle_commitment = oracle_commitment;
        position.updated_at = Clock::get()?.unix_timestamp;
        if liquidatable {
            position.status = PositionStatus::Liquidatable;
        }

        emit!(PrivateLiquidationChecked {
            owner: position.owner,
            position: position.key(),
            oracle_commitment,
            liquidatable
        });

        Ok(())
    }

    pub fn close_position(ctx: Context<ClosePosition>, settlement_amount: u64) -> Result<()> {
        let position = &mut ctx.accounts.position;
        require!(
            position.status == PositionStatus::Open || position.status == PositionStatus::Liquidatable,
            ArdexError::PositionNotOpen
        );

        let vault = &mut ctx.accounts.user_vault;
        vault.reserved_collateral = vault
            .reserved_collateral
            .checked_sub(position.collateral_amount)
            .ok_or(ArdexError::MathOverflow)?;
        vault.collateral_deposited = vault
            .collateral_deposited
            .checked_sub(position.collateral_amount)
            .ok_or(ArdexError::MathOverflow)?
            .checked_add(settlement_amount)
            .ok_or(ArdexError::MathOverflow)?;

        position.status = PositionStatus::Closed;
        position.updated_at = Clock::get()?.unix_timestamp;

        emit!(PositionClosed {
            owner: position.owner,
            position: position.key(),
            settlement_amount
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeCollateralVault<'info> {
    #[account(
        init,
        payer = owner,
        space = UserVault::SPACE,
        seeds = [b"vault", owner.key().as_ref()],
        bump
    )]
    pub user_vault: Account<'info, UserVault>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositCollateral<'info> {
    #[account(
        mut,
        seeds = [b"vault", owner.key().as_ref()],
        bump = user_vault.bump,
        has_one = owner
    )]
    pub user_vault: Account<'info, UserVault>,
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut)]
    pub user_usdc_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault_usdc_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(position_id: [u8; 16])]
pub struct OpenEncryptedPosition<'info> {
    #[account(
        mut,
        seeds = [b"vault", owner.key().as_ref()],
        bump = user_vault.bump,
        has_one = owner
    )]
    pub user_vault: Account<'info, UserVault>,
    #[account(
        init,
        payer = owner,
        space = EncryptedPosition::space(MAX_ENCRYPTED_POSITION_BYTES),
        seeds = [b"position", owner.key().as_ref(), position_id.as_ref()],
        bump
    )]
    pub position: Account<'info, EncryptedPosition>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MarkLiquidationChecked<'info> {
    #[account(mut)]
    pub protocol_authority: Signer<'info>,
    #[account(mut)]
    pub position: Account<'info, EncryptedPosition>,
}

#[derive(Accounts)]
pub struct ClosePosition<'info> {
    #[account(
        mut,
        seeds = [b"vault", owner.key().as_ref()],
        bump = user_vault.bump,
        has_one = owner
    )]
    pub user_vault: Account<'info, UserVault>,
    #[account(
        mut,
        seeds = [b"position", owner.key().as_ref(), position.position_id.as_ref()],
        bump = position.bump,
        has_one = owner
    )]
    pub position: Account<'info, EncryptedPosition>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

#[account]
pub struct UserVault {
    pub owner: Pubkey,
    pub collateral_deposited: u64,
    pub reserved_collateral: u64,
    pub bump: u8,
}

impl UserVault {
    pub const SPACE: usize = 8 + 32 + 8 + 8 + 1;

    pub fn available_collateral(&self) -> u64 {
        self.collateral_deposited
            .saturating_sub(self.reserved_collateral)
    }
}

#[account]
pub struct EncryptedPosition {
    pub owner: Pubkey,
    pub position_id: [u8; 16],
    pub market: Market,
    pub status: PositionStatus,
    pub collateral_amount: u64,
    pub side_commitment: [u8; 32],
    pub oracle_commitment: [u8; 32],
    pub nonce: [u8; 12],
    pub encrypted_payload: Vec<u8>,
    pub opened_at: i64,
    pub updated_at: i64,
    pub bump: u8,
}

impl EncryptedPosition {
    pub fn space(max_payload: usize) -> usize {
        8 + 32 + 16 + 1 + 1 + 8 + 32 + 32 + 12 + 4 + max_payload + 8 + 8 + 1
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum Market {
    SolUsd,
    BtcUsd,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum PositionStatus {
    Open,
    Liquidatable,
    Closed,
}

#[event]
pub struct VaultInitialized {
    pub owner: Pubkey,
    pub vault: Pubkey,
}

#[event]
pub struct CollateralDeposited {
    pub owner: Pubkey,
    pub amount: u64,
    pub available: u64,
}

#[event]
pub struct EncryptedPositionOpened {
    pub owner: Pubkey,
    pub position: Pubkey,
    pub market: Market,
    pub side_commitment: [u8; 32],
    pub collateral_amount: u64,
}

#[event]
pub struct PrivateLiquidationChecked {
    pub owner: Pubkey,
    pub position: Pubkey,
    pub oracle_commitment: [u8; 32],
    pub liquidatable: bool,
}

#[event]
pub struct PositionClosed {
    pub owner: Pubkey,
    pub position: Pubkey,
    pub settlement_amount: u64,
}

#[error_code]
pub enum ArdexError {
    #[msg("Amount must be greater than zero.")]
    InvalidAmount,
    #[msg("Encrypted payload is too large.")]
    EncryptedPayloadTooLarge,
    #[msg("Insufficient collateral in vault.")]
    InsufficientCollateral,
    #[msg("Position is not open.")]
    PositionNotOpen,
    #[msg("Math overflow.")]
    MathOverflow,
}
