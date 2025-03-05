use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("2FYV28WPRyd6qD6k62BsB2kf6AJ8UBUpnNTR5J2h37da");

#[program]
pub mod solana_toy {
    use super::*;

    /// Initialize the vault (Set reward ratios, but not recipients)
    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        reward_ratios: Vec<u64>,   // ✅ Preset reward percentages (must sum to 100)
    ) -> Result<()> {
        require!(
            reward_ratios.iter().sum::<u64>() == 100,
            VaultError::InvalidRatioSum
        );

        let vault_data = &mut ctx.accounts.vault_data;
        vault_data.owner = *ctx.accounts.owner.key;
        vault_data.reward_ratios = reward_ratios;

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

    /// Distribute SOL dynamically to selected recipients based on preset ratios
    pub fn distribute_sol<'info>(ctx: Context<'_, '_, '_, 'info, DistributeSol<'info>>) -> Result<()> {
        let vault_data = &ctx.accounts.vault_data;
        require!(vault_data.owner == *ctx.accounts.owner.key, VaultError::Unauthorized);

        let vault_balance = ctx.accounts.vault.to_account_info().lamports();
        require!(vault_balance > 0, VaultError::InsufficientFunds);

        let recipient_count = ctx.remaining_accounts.len();
        require!(
            recipient_count == vault_data.reward_ratios.len(),
            VaultError::MismatchedRecipients
        );

        for (i, recipient_account) in ctx.remaining_accounts.iter().enumerate() {
            let reward_amount = vault_balance * vault_data.reward_ratios[i] / 100;

            let transfer_instruction = Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: recipient_account.to_account_info(),
            };

            transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    transfer_instruction,
                    &[&[b"vault", &[ctx.bumps.vault]]],
                ),
                reward_amount,
            )?;
        }

        Ok(())
    }
}

/// Vault metadata account (Stores reward ratios but not recipients)
#[account]
pub struct VaultData {
    pub owner: Pubkey,
    pub reward_ratios: Vec<u64>,   // ✅ Reward distribution percentages (sum must be 100)
}

/// Error definitions
#[error_code]
pub enum VaultError {
    #[msg("Unauthorized access! Only the vault owner can distribute funds.")]
    Unauthorized,
    #[msg("The sum of reward ratios must be 100.")]
    InvalidRatioSum,
    #[msg("Vault does not have enough SOL to distribute.")]
    InsufficientFunds,
    #[msg("Number of recipients must match number of reward ratios.")]
    MismatchedRecipients,
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + 32 + (8 * 10), // ✅ Space for up to 10 reward ratios
        seeds = [b"vault_data"],
        bump
    )]
    pub vault_data: Account<'info, VaultData>,
    /// CHECK: This is a PDA that will only hold SOL, and has no data.
    #[account(
        seeds = [b"vault"], // ✅ PDA for SOL storage
        bump
    )]
    pub vault: AccountInfo<'info>,
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
    pub vault_data: Account<'info, VaultData>,
    /// CHECK: Remaining accounts are dynamically passed recipients.
    pub system_program: Program<'info, System>,
}
