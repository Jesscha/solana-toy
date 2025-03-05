use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("2FYV28WPRyd6qD6k62BsB2kf6AJ8UBUpnNTR5J2h37da");

#[program]
pub mod solana_toy {
    use super::*;

    /// Initialize the vault (Create metadata PDA)
    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        let vault_data = &mut ctx.accounts.vault_data;
        vault_data.owner = *ctx.accounts.owner.key;
        Ok(())
    }

    /// Deposit SOL into the vault
    pub fn deposit_sol(ctx: Context<DepositSol>, amount: u64) -> Result<()> {
        let transfer_instruction = Transfer {
            from: ctx.accounts.user.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
        };

        transfer(
            CpiContext::new(ctx.accounts.system_program.to_account_info(), transfer_instruction),
            amount,
        )?;

        Ok(())
    }

    /// Distribute SOL to a user (Only the owner can request this)
    pub fn distribute_sol(ctx: Context<DistributeSol>, amount: u64) -> Result<()> {
        let vault_data = &ctx.accounts.vault_data;
        require!(vault_data.owner == *ctx.accounts.owner.key, VaultError::Unauthorized);

        let transfer_instruction = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.recipient.to_account_info(),
        };

        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                transfer_instruction,
                &[&[b"vault", &[ctx.bumps.vault]]], // ✅ PDA signs transaction
            ),
            amount,
        )?;

        Ok(())
    }
}

/// Vault metadata account (Only stores owner)
#[account]
pub struct VaultData {
    pub owner: Pubkey, // The authorized account to distribute SOL
}

/// Error definitions
#[error_code]
pub enum VaultError {
    #[msg("Unauthorized access! Only the vault owner can distribute funds.")]
    Unauthorized,
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + 32,
        seeds = [b"vault_data"], // ✅ Metadata PDA
        bump
    )]
    pub vault_data: Account<'info, VaultData>,
    #[account(
        seeds = [b"vault"], // ✅ Pure SOL-holding PDA
        bump
    )]
    pub vault: SystemAccount<'info>,  // ✅ No `init` needed
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// Context for depositing SOL into the vault
#[derive(Accounts)]
pub struct DepositSol<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, seeds = [b"vault"], bump)] // ✅ Vault PDA for SOL storage
    pub vault: SystemAccount<'info>, 
    pub system_program: Program<'info, System>,
}

/// Context for distributing SOL from the vault
#[derive(Accounts)]
pub struct DistributeSol<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, seeds = [b"vault"], bump)]
    pub vault: SystemAccount<'info>, // ✅ Pure SOL account
    #[account(mut, seeds = [b"vault_data"], bump)]
    pub vault_data: Account<'info, VaultData>, // ✅ Holds owner metadata
    #[account(mut)]
    pub recipient: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}
