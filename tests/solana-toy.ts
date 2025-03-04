import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaToy } from "../target/types/solana_toy";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";

describe("solana-toy", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.SolanaToy as Program<SolanaToy>;
  const provider = anchor.getProvider();

  // Generate test accounts
  const admin = anchor.web3.Keypair.generate();
  const user = anchor.web3.Keypair.generate();
  const vault = anchor.web3.Keypair.generate();
  const arena = anchor.web3.Keypair.generate();

  before(async () => {
    console.log("Airdropping SOL to admin and user...");
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(admin.publicKey, 2 * LAMPORTS_PER_SOL),
      "confirmed"
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(user.publicKey, 2 * LAMPORTS_PER_SOL),
      "confirmed"
    );
  
    // Wait for balances to update
    await new Promise((resolve) => setTimeout(resolve, 3000));
  
    console.log("Creating vault account...");
    const createVaultIx = SystemProgram.createAccount({
      fromPubkey: admin.publicKey,
      newAccountPubkey: vault.publicKey,
      space: 0,
      lamports: await provider.connection.getMinimumBalanceForRentExemption(0),
      programId: SystemProgram.programId,
    });
  
    const tx = new anchor.web3.Transaction().add(createVaultIx);
    await anchor.web3.sendAndConfirmTransaction(
      provider.connection,
      tx,
      [admin, vault]
    );
  
    console.log("Vault account created:", vault.publicKey.toString());
  
    // Debugging: Log balances
    const adminBalance = await provider.connection.getBalance(admin.publicKey);
    const userBalance = await provider.connection.getBalance(user.publicKey);
    console.log(`Admin Balance: ${adminBalance / LAMPORTS_PER_SOL} SOL`);
    console.log(`User Balance: ${userBalance / LAMPORTS_PER_SOL} SOL`);
  });
  

  it("Initializes the arena", async () => {
    await program.methods
      .initialize()
      .accounts({
        admin: admin.publicKey,
        arena: arena.publicKey,
        vault: vault.publicKey,
        systemProgram: SystemProgram.programId,
      } as any)
      .signers([admin, arena])
      .rpc();

    const arenaAccount = await program.account.arena.fetch(arena.publicKey);
    assert.equal(arenaAccount.admin.toString(), admin.publicKey.toString());
    assert.equal(arenaAccount.vault.toString(), vault.publicKey.toString());
    assert.equal(arenaAccount.totalPool.toNumber(), 0);
    assert.equal(arenaAccount.active, false);
  });

  it("Starts a round", async () => {
    await program.methods
      .startRound()
      .accounts({
        admin: admin.publicKey,
        arena: arena.publicKey,
      })
      .signers([admin])
      .rpc();

    const arenaAccount = await program.account.arena.fetch(arena.publicKey);
    assert.equal(arenaAccount.active, true);
  });

  it("Allows user participation", async () => {
    const amount = 0.1 * LAMPORTS_PER_SOL; // 0.1 SOL

    const beforeBalance = await provider.connection.getBalance(vault.publicKey);

    await program.methods
      .participate(new anchor.BN(amount))
      .accounts({
        user: user.publicKey,
        vault: vault.publicKey,
        arena: arena.publicKey,
        systemProgram: SystemProgram.programId,
      } as any)
      .signers([user])
      .rpc();

    const afterBalance = await provider.connection.getBalance(vault.publicKey);
    const arenaAccount = await program.account.arena.fetch(arena.publicKey);

    assert.equal(afterBalance - beforeBalance, amount);
    assert.equal(arenaAccount.totalPool.toNumber(), amount);
  });

  it("Ends round and distributes rewards", async () => {
    console.log('Step 1: Setting up winners and reward amounts');
    const winners = [user.publicKey] as any;
    const amounts = [new anchor.BN(0.05 * LAMPORTS_PER_SOL)]; // 0.05 SOL
    console.log('Winners:', winners.map(w => w.toString()));
    console.log('Reward amounts:', amounts.map(a => a.toString()));

    console.log('Step 2: Getting user balance before distribution');
    const beforeBalance = await provider.connection.getBalance(user.publicKey);
    console.log('User balance before:', beforeBalance / LAMPORTS_PER_SOL, 'SOL');

    console.log('Step 3: Calling endRound instruction with accounts',
      {
        admin: admin.publicKey,
        vault: vault.publicKey,
        arena: arena.publicKey,
        systemProgram: SystemProgram.programId,
      } as any
    );
    await program.methods
      .endRound(winners, amounts)
      .accounts({
        admin: admin.publicKey,
        vault: vault.publicKey,
        arena: arena.publicKey,
        systemProgram: SystemProgram.programId,
      } as any)
      .signers([admin])
      .rpc();

    console.log('Step 4: Getting user balance after distribution');
    const afterBalance = await provider.connection.getBalance(user.publicKey);
    console.log('User balance after:', afterBalance / LAMPORTS_PER_SOL, 'SOL');
    console.log('Balance difference:', (afterBalance - beforeBalance) / LAMPORTS_PER_SOL, 'SOL');
    
    console.log('Step 5: Fetching updated arena state');
    const arenaAccount = await program.account.arena.fetch(arena.publicKey);
    console.log('Arena total pool:', arenaAccount.totalPool.toString());
    console.log('Arena active status:', arenaAccount.active);

    console.log('Step 6: Verifying distribution and arena state');
    assert.equal(afterBalance - beforeBalance, amounts[0].toNumber());
    assert.equal(arenaAccount.totalPool.toNumber(), 0);
    assert.equal(arenaAccount.active, false);
  });

  it("Prevents unauthorized users from starting a round", async () => {
    try {
      await program.methods
        .startRound()
        .accounts({
          admin: user.publicKey, // Unauthorized user
          arena: arena.publicKey,
        })
        .signers([user])
        .rpc();
      assert.fail("Should have thrown an error");
    } catch (error) {
      assert.include(error.toString(), "Unauthorized access");
    }
  });

  it("Prevents participation when the round is inactive", async () => {
    try {
      await program.methods
        .participate(new anchor.BN(0.1 * LAMPORTS_PER_SOL))
        .accounts({
          user: user.publicKey,
          vault: vault.publicKey,
          arena: arena.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .signers([user])
        .rpc();
      assert.fail("Should have thrown an error");
    } catch (error) {
      assert.include(error.toString(), "Round is not active");
    }
  });
});
