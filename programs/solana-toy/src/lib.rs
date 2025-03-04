use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_instruction;

declare_id!("2FYV28WPRyd6qD6k62BsB2kf6AJ8UBUpnNTR5J2h37da");

#[program]
pub mod solana_toy {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let arena = &mut ctx.accounts.arena;
        arena.admin = ctx.accounts.admin.key();
        arena.vault = ctx.accounts.vault.key();
        arena.total_pool = 0;
        arena.active = false;
        msg!("Arena initialized with admin: {}", arena.admin);
        Ok(())
    }

    pub fn start_round(ctx: Context<StartRound>) -> Result<()> {
        let arena = &mut ctx.accounts.arena;
        require!(!arena.active, CustomError::RoundAlreadyActive);
        require!(ctx.accounts.admin.key() == arena.admin, CustomError::Unauthorized);
        
        arena.active = true;
        msg!("Round started");
        Ok(())
    }

    pub fn participate(ctx: Context<Participate>, amount: u64) -> Result<()> {
        let arena = &mut ctx.accounts.arena;
        require!(arena.active, CustomError::RoundNotActive);
        
        // Transfer SOL from user to vault
        anchor_lang::solana_program::program::invoke(
            &system_instruction::transfer(
                ctx.accounts.user.key,
                ctx.accounts.vault.key,
                amount
            ),
            &[
                ctx.accounts.user.to_account_info(),
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
        
        arena.total_pool += amount;
        msg!("User {} participated with {} SOL", 
            ctx.accounts.user.key(), 
            amount as f64 / 1_000_000_000.0
        );
        Ok(())
    }

    pub fn end_round<'a, 'b, 'c, 'd, 'info>(
        ctx: Context<'a, 'b, 'c, 'd, EndRound<'info>>,
        winners: Vec<Pubkey>,
        amounts: Vec<u64>
    ) -> Result<()> 
    where
        'info: 'd,
        'd: 'info
    {
        let arena = &mut ctx.accounts.arena;
        require!(arena.active, CustomError::RoundNotActive);
        require!(winners.len() == amounts.len(), CustomError::InvalidInput);
        require!(ctx.accounts.admin.key() == arena.admin, CustomError::Unauthorized);
    
        // Ensure that there are enough remaining accounts passed
        require!(
            ctx.remaining_accounts.len() >= winners.len(),
            CustomError::InvalidInput
        );
    
        for (i, (winner, amount)) in winners.iter().zip(amounts.iter()).enumerate() {
            let winner_account = &ctx.remaining_accounts[i];
            let transfer_ix = system_instruction::transfer(
                ctx.accounts.vault.key,
                winner,
                *amount
            );
    
            anchor_lang::solana_program::program::invoke(
                &transfer_ix,
                &[
                    ctx.accounts.vault.to_account_info(),
                    winner_account.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
            )?;
            msg!("Winner {} received {} SOL", winner, *amount as f64 / 1_000_000_000.0);
        }
    
        arena.total_pool = 0;
        arena.active = false;
        msg!("Round ended successfully");
        Ok(())
    }
    
    
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + 32 + 32 + 8 + 1)] // space for Arena struct
    pub arena: Account<'info, Arena>,
    #[account(mut)]
    /// CHECK: This is safe because we only use it as a destination for transfers
    pub vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StartRound<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(mut)]
    pub arena: Account<'info, Arena>,
}

#[derive(Accounts)]
pub struct Participate<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    /// CHECK: This is safe because we only use it as a destination for transfers
    pub vault: UncheckedAccount<'info>,
    #[account(mut)]
    pub arena: Account<'info, Arena>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct EndRound<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(mut)]
    /// CHECK: This is safe because we only use it as a destination for transfers
    pub vault: UncheckedAccount<'info>,
    #[account(mut)]
    pub arena: Account<'info, Arena>,
    pub system_program: Program<'info, System>,
}


#[account]
pub struct Arena {
    pub admin: Pubkey,
    pub vault: Pubkey,
    pub total_pool: u64,
    pub active: bool,
}

#[error_code]
pub enum CustomError {
    #[msg("Invalid input parameters")]
    InvalidInput,
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Round is already active")]
    RoundAlreadyActive,
    #[msg("Round is not active")]
    RoundNotActive,
}
