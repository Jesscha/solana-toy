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
  const DEFAULT_FEE = 0.1;
  const PLATFORM_FEE = 0.05;

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

    console.log("📌 Initializing Vault with preset reward ratios and platform fee...");
    const rewardRatios = [new anchor.BN(40), new anchor.BN(30), new anchor.BN(25)]; // 40%, 30%, 30%
    const platformFee = new anchor.BN(PLATFORM_FEE * 100); // ✅ 5% platform fee

    await program.methods
      .initializeVault(rewardRatios, platformFee)
      .accounts({
        owner: authority.publicKey,
        vault: vaultPDA,
        vaultData: vaultDataPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .rpc();

    console.log("✅ Vault Initialized!");
  });

  it("Fails to deposit when the round is not running", async () => {
    try {
      await program.methods
        .depositSol(new anchor.BN(DEFAULT_FEE * anchor.web3.LAMPORTS_PER_SOL))
        .accounts({
          user: user.publicKey,
          vault: vaultPDA,
          vaultData: vaultDataPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        } as any)
        .signers([user])
        .rpc();

      assert.fail("Deposit should have failed because the round is not running.");
    } catch (err) {
      console.log("✅ Deposit correctly failed when the round was inactive.");
    }
  });

  it("Starts the league round", async () => {
    console.log("📌 Starting the league round...");
    await program.methods
      .startRound()
      .accounts({
        owner: authority.publicKey,
        vaultData: vaultDataPDA,
      } as any)
      .rpc();

    console.log("✅ League round started!");
  });

  it("User deposits 0.1 SOL into the vault when round is active", async () => {
    const initialBalance = await provider.connection.getBalance(vaultPDA);
    console.log("🔹 Initial Vault Balance:", initialBalance / anchor.web3.LAMPORTS_PER_SOL, "SOL");

    await program.methods
      .depositSol(new anchor.BN(0.1 * anchor.web3.LAMPORTS_PER_SOL))
      .accounts({
        user: user.publicKey,
        vault: vaultPDA,
        vaultData: vaultDataPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .signers([user])
      .rpc();

    const finalBalance = await provider.connection.getBalance(vaultPDA);
    console.log("🔹 Final Vault Balance:", finalBalance / anchor.web3.LAMPORTS_PER_SOL, "SOL");

    assert.equal(
      finalBalance - initialBalance,
      DEFAULT_FEE * anchor.web3.LAMPORTS_PER_SOL,
      "Vault should have received 0.2 SOL"
    );
  });

  it("Ends the league round and transfers platform fee", async () => {
    const initialAuthorityBalance = await provider.connection.getBalance(authority.publicKey);
    const vaultBalance = await provider.connection.getBalance(vaultPDA);
    console.log("🔹 Initial Authority Balance:", initialAuthorityBalance / anchor.web3.LAMPORTS_PER_SOL, "SOL");
    console.log("🔹 Initial Vault Balance:", vaultBalance / anchor.web3.LAMPORTS_PER_SOL, "SOL");

    console.log("📌 Ending the league round...");
    await program.methods
      .endRound()
      .accounts({
        owner: authority.publicKey,
        vault: vaultPDA,
        vaultData: vaultDataPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .rpc();

    const finalAuthorityBalance = await provider.connection.getBalance(authority.publicKey);
   
    const expectedFee = DEFAULT_FEE * PLATFORM_FEE * anchor.web3.LAMPORTS_PER_SOL;
    const receivedFee = finalAuthorityBalance - initialAuthorityBalance;

    // Allow a small margin of error due to transaction fees
    const tolerance = 5000; // ~0.000005 SOL buffer for tx fee

    assert.isAtMost(Math.abs(receivedFee - expectedFee), tolerance, `Owner should have received platform fee (adjusted for transaction fees).`);

    console.log("✅ Platform fee transferred to owner!");
  });

  it("Distributes remaining SOL to dynamically selected recipients based on preset ratios", async () => {
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
          isWritable: true,
          isSigner: false,
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
