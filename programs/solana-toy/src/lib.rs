use anchor_lang::prelude::*;

declare_id!("5vhFMApEVBDFWUhnGtQBepGLT1PCp1Bi9rKxiAYhomci");

#[program]
pub mod solana_toy {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("hello world2 {}", &id());

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
