use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_program;
use anchor_lang::solana_program::system_instruction;
use anchor_lang::solana_program::program::invoke;

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

    pub fn participate(ctx: Context<Participate>) -> Result<()> {
        let arena = &mut ctx.accounts.arena;
        let user = &ctx.accounts.user;
        let vault = &mut ctx.accounts.vault;
        
        let fee = 100_000_000; // 0.1 SOL

        invoke(
            &system_instruction::transfer(user.key, vault.key, fee),
            &[user.to_account_info(), vault.to_account_info()],
        )?;
        
        arena.total_pool += fee;
        msg!("User {} participated with 0.1 SOL", user.key());
        Ok(())
    }

    pub fn end_round(ctx: Context<EndRound>, winners: Vec<Pubkey>, rewards: Vec<u64>) -> Result<()> {
        let arena = &mut ctx.accounts.arena;
        let vault = &mut ctx.accounts.vault;
        let admin = &ctx.accounts.admin;

        require!(arena.active, CustomError::RoundNotActive);
        require!(winners.len() == rewards.len(), CustomError::InvalidInput);
        require!(admin.key() == arena.admin, CustomError::Unauthorized);

        for (winner, amount) in winners.iter().zip(rewards.iter()) {
            invoke(
                &system_instruction::transfer(vault.key, winner, *amount),
                &[vault.to_account_info(), admin.to_account_info()],
            )?;
            msg!("Winner {} received {} SOL", winner, *amount as f64 / 1_000_000_000.0);
        }

        arena.total_pool = 0;
        arena.active = false;
        msg!("Round ended successfully");
        Ok(())
    }
}

#[account]
pub struct Arena {
    pub admin: Pubkey,
    pub vault: Pubkey,
    pub total_pool: u64,
    pub active: bool,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + 32 + 32 + 8 + 1)]
    pub arena: Account<'info, Arena>,
    #[account(mut)]
    pub vault: SystemAccount<'info>,
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
    pub vault: SystemAccount<'info>,
    #[account(mut)]
    pub arena: Account<'info, Arena>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct EndRound<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(mut)]
    pub vault: SystemAccount<'info>,
    #[account(mut)]
    pub arena: Account<'info, Arena>,
    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum CustomError {
    #[msg("Invalid input parameters")] InvalidInput,
    #[msg("Unauthorized access")] Unauthorized,
    #[msg("Round is already active")] RoundAlreadyActive,
    #[msg("Round is not active")] RoundNotActive,
}