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
  let vaultDataPDA: anchor.web3.PublicKey;
  let vaultBump: number;
  let vaultDataBump: number;

  let authority = provider.wallet;
  let user = anchor.web3.Keypair.generate();
  let recipient1 = anchor.web3.Keypair.generate();
  let recipient2 = anchor.web3.Keypair.generate();
  let recipient3 = anchor.web3.Keypair.generate();

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

    // Derive the PDAs for vault and vault metadata
    [vaultPDA, vaultBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      program.programId
    );

    [vaultDataPDA, vaultDataBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault_data")],
      program.programId
    );

    // Initialize the vault
    await program.methods
      .initializeVault()
      .accounts({
        owner: authority.publicKey,
        vault: vaultPDA,
        vaultData: vaultDataPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .rpc();

    // ✅ Airdrop 0.5 SOL to the vault PDA to ensure it can distribute SOL later
    const vaultAirdrop = await provider.connection.requestAirdrop(
      vaultPDA,
      0.5 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(vaultAirdrop);
  });

  it("User deposits 0.1 SOL", async () => {
    const initialBalance = await provider.connection.getBalance(vaultPDA);

    await program.methods
      .depositSol(new anchor.BN(0.1 * anchor.web3.LAMPORTS_PER_SOL))
      .accounts({
        user: user.publicKey,
        vault: vaultPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .signers([user]) // ✅ Ensure user signs the deposit
      .rpc();

    const finalBalance = await provider.connection.getBalance(vaultPDA);
    console.log("finalBalance", finalBalance);
    assert.equal(
      finalBalance - initialBalance,
      0.1 * anchor.web3.LAMPORTS_PER_SOL,
      "Vault should have received 0.1 SOL"
    );
  });

  it("Authorized account distributes SOL to multiple recipients", async () => {
    const recipients = [recipient1.publicKey, recipient2.publicKey, recipient3.publicKey];
    const amounts = [
      new anchor.BN(0.05 * anchor.web3.LAMPORTS_PER_SOL), // 0.05 SOL
      new anchor.BN(0.1 * anchor.web3.LAMPORTS_PER_SOL),  // 0.1 SOL
      new anchor.BN(0.15 * anchor.web3.LAMPORTS_PER_SOL), // 0.15 SOL
    ];

    const initialBalances = await Promise.all(
      recipients.map((recipient) => provider.connection.getBalance(recipient))
    );

    await program.methods
      .distributeSol(recipients, amounts)
      .accounts({
        owner: authority.publicKey,
        vault: vaultPDA,
        vaultData: vaultDataPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .remainingAccounts(
        recipients.map((pubkey) => ({
          pubkey,
          isWritable: true, // ✅ Recipients' balances change
          isSigner: false,  // ✅ Recipients don't need to sign
        }))
      )
      .rpc();

    const finalBalances = await Promise.all(
      recipients.map((recipient) => provider.connection.getBalance(recipient))
    );

    recipients.forEach((recipient, i) => {
      console.log(`Recipient ${i + 1} Final Balance:`, finalBalances[i]);
      assert.isAbove(finalBalances[i], initialBalances[i], `Recipient ${i + 1} should have received SOL`);
    });
  });
});
