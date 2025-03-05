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

    /// Distribute SOL to multiple recipients
    pub fn distribute_sol<'info>(
        ctx: Context<'_, '_, '_, 'info, DistributeSol<'info>>,
        recipients: Vec<Pubkey>,  // ✅ List of recipient public keys
        amounts: Vec<u64>,        // ✅ List of amounts (must match recipients)
    ) -> Result<()> {
        let vault_data = &ctx.accounts.vault_data;
        require!(vault_data.owner == *ctx.accounts.owner.key, VaultError::Unauthorized);

        // Ensure the arrays are of the same length
        require!(
            recipients.len() == amounts.len(),
            VaultError::InvalidRecipientList
        );

        let total_distribution: u64 = amounts.iter().sum();

        // Ensure vault has enough SOL to distribute
        let vault_balance = ctx.accounts.vault.to_account_info().lamports();
        require!(
            vault_balance >= total_distribution,
            VaultError::InsufficientFunds
        );

        for (i, recipient) in recipients.iter().enumerate() {
            let transfer_instruction = Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.remaining_accounts[i].to_account_info(), // ✅ Use `remaining_accounts` for dynamic recipients
            };

            transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    transfer_instruction,
                    &[&[b"vault", &[ctx.bumps.vault]]], // ✅ PDA signs transaction
                ),
                amounts[i],
            )?;
        }

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
    #[msg("Recipient and amount lists must be of the same length.")]
    InvalidRecipientList,
    #[msg("Vault does not have enough SOL to distribute.")]
    InsufficientFunds,
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
    /// CHECK: This is a PDA that will only hold SOL, and has no data.
    #[account(
        seeds = [b"vault"], // ✅ PDA for SOL storage
        bump
    )]
    pub vault: AccountInfo<'info>,  // ✅ Fixed: Added CHECK comment
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositSol<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    /// CHECK: This PDA is used for storing SOL and is validated by seeds.
    #[account(mut, seeds = [b"vault"], bump)] 
    pub vault: AccountInfo<'info>, 
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DistributeSol<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: This PDA holds SOL and is validated by seeds.
    #[account(mut, seeds = [b"vault"], bump)]
    pub vault: AccountInfo<'info>, 
    #[account(mut, seeds = [b"vault_data"], bump)]
    pub vault_data: Account<'info, VaultData>, // ✅ Metadata account
    /// CHECK: Remaining accounts will be dynamically provided for recipients.
    pub system_program: Program<'info, System>,
}
