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
    console.log("📌 Airdropping SOL to the authority...");
    const tx = await provider.connection.requestAirdrop(
      authority.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(tx);

    console.log("📌 Airdropping SOL to the user...");
    const userAirdrop = await provider.connection.requestAirdrop(
      user.publicKey,
      1 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(userAirdrop);

    console.log("📌 Deriving PDAs...");
    [vaultPDA, vaultBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      program.programId
    );

    [vaultDataPDA, vaultDataBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault_data")],
      program.programId
    );

    console.log("📌 Initializing Vault with preset reward ratios...");
    const rewardRatios = [new anchor.BN(40), new anchor.BN(30), new anchor.BN(30)]; // 40%, 30%, 30%
    await program.methods
      .initializeVault(rewardRatios)
      .accounts({
        owner: authority.publicKey,
        vault: vaultPDA,
        vaultData: vaultDataPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .rpc();

    console.log("✅ Vault Initialized!");

    console.log("📌 Airdropping 0.5 SOL to the vault PDA...");
    const vaultAirdrop = await provider.connection.requestAirdrop(
      vaultPDA,
      0.5 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(vaultAirdrop);
    console.log("✅ Vault funded with 0.5 SOL!");
  });

  it("User deposits 0.1 SOL into the vault", async () => {
    const initialBalance = await provider.connection.getBalance(vaultPDA);
    console.log("🔹 Initial Vault Balance:", initialBalance / anchor.web3.LAMPORTS_PER_SOL, "SOL");

    await program.methods
      .depositSol(new anchor.BN(0.1 * anchor.web3.LAMPORTS_PER_SOL))
      .accounts({
        user: user.publicKey,
        vault: vaultPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .signers([user])
      .rpc();

    const finalBalance = await provider.connection.getBalance(vaultPDA);
    console.log("🔹 Final Vault Balance:", finalBalance / anchor.web3.LAMPORTS_PER_SOL, "SOL");

    assert.equal(
      finalBalance - initialBalance,
      0.1 * anchor.web3.LAMPORTS_PER_SOL,
      "Vault should have received 0.1 SOL"
    );
  });

  it("Distributes SOL to dynamically selected recipients based on preset ratios", async () => {
    const recipients = [recipient1.publicKey, recipient2.publicKey, recipient3.publicKey];

    console.log("📌 Getting initial balances of recipients...");
    const initialBalances = await Promise.all(
      recipients.map((recipient) => provider.connection.getBalance(recipient))
    );

    console.log("📌 Distributing SOL...");
    await program.methods
      .distributeSol()
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

    console.log("📌 Getting final balances of recipients...");
    const finalBalances = await Promise.all(
      recipients.map((recipient) => provider.connection.getBalance(recipient))
    );

    console.log("🔹 Final Balances:");
    recipients.forEach((recipient, i) => {
      console.log(`Recipient ${i + 1}: ${finalBalances[i] / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    });

    // ✅ Ensure recipients received the expected amount
    const vaultBalanceAfterDistribution = await provider.connection.getBalance(vaultPDA);
    console.log("🔹 Vault Balance After Distribution:", vaultBalanceAfterDistribution / anchor.web3.LAMPORTS_PER_SOL, "SOL");

    recipients.forEach((recipient, i) => {
      assert.isAbove(finalBalances[i], initialBalances[i], `Recipient ${i + 1} should have received SOL`);
    });

    console.log("✅ Distribution test passed!");
  });
});
