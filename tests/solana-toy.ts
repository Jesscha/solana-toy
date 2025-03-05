import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaToy } from "../target/types/solana_toy";
import { assert } from "chai";

describe("solana_toy", () => {
  // Configure the client
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.SolanaToy as Program<SolanaToy>;

  let vaultPDA: anchor.web3.PublicKey;
  let vaultBump: number;

  let authority = provider.wallet;
  let user = anchor.web3.Keypair.generate();
  let recipient = anchor.web3.Keypair.generate();

  before(async () => {
    // Airdrop SOL to the authority (owner)
    const tx = await provider.connection.requestAirdrop(
      authority.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(tx);
  
    // Airdrop SOL to the user to ensure they can deposit SOL
    const userAirdrop = await provider.connection.requestAirdrop(
      user.publicKey,
      1 * anchor.web3.LAMPORTS_PER_SOL // ✅ Give user 1 SOL
    );
    await provider.connection.confirmTransaction(userAirdrop);
  
    // Derive the PDA for the vault
    [vaultPDA, vaultBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      program.programId
    );
  
    // Initialize the vault
    await program.methods
      .initializeVault()
      .accounts({
        owner: authority.publicKey,
        vault: vaultPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  });
  

  it("User deposits 0.1 SOL", async () => {
    const initialBalance = await provider.connection.getBalance(vaultPDA);

    await program.methods
      .depositSol(new anchor.BN(0.1 * anchor.web3.LAMPORTS_PER_SOL))
      .accounts({
        user: user.publicKey,
        vault: vaultPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    const finalBalance = await provider.connection.getBalance(vaultPDA);
    assert.equal(
      finalBalance - initialBalance,
      0.1 * anchor.web3.LAMPORTS_PER_SOL,
      "Vault should have received 0.1 SOL"
    );
  });

  it("Authorized account distributes SOL", async () => {
    await program.methods
      .distributeSol(new anchor.BN(50_000_000))
      .accounts({
        owner: authority.publicKey,
        vault: vaultPDA,
        recipient: recipient.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const recipientBalance = await provider.connection.getBalance(recipient.publicKey);
    assert.isAbove(recipientBalance, 50_000_000, "Recipient should have received SOL");
  });
});
