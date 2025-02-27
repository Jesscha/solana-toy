import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { SolanaToy } from "../target/types/solana_toy";
import { TOKEN_PROGRAM_ID, createAssociatedTokenAccount, getAssociatedTokenAddress, mintTo } from "@solana/spl-token";

describe("solana-toy", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.SolanaToy as Program<SolanaToy>;
  
  // Use the provider's wallet
  const payer = provider.wallet as anchor.Wallet; // Cast to `Wallet` to access properties
  
  const metaData = {
    name: "Solana Toy",
    symbol: "ST",
    uri: "https://example.com/metadata",
  };

  it("Create and Mint an SPL Token", async () => {
    // Generate a new mint keypair
    const mintKeyPair = new Keypair();
    console.log(`Mint Account Address: ${mintKeyPair.publicKey.toBase58()}`);

    // Create the SPL Token Mint
    const createMintTx = await program.methods
      .createTokenMint(9, metaData.name, metaData.symbol, metaData.uri)
      .accounts({
        payer: payer.publicKey, // Use `publicKey` instead of `payer`
        mintAccount: mintKeyPair.publicKey,
      })
      .signers([mintKeyPair])
      .rpc();

    console.log("✅ Token Mint Created");
    console.log(`Transaction Signature: ${createMintTx}`);

    // Get Associated Token Account (ATA) for the payer
    const associatedTokenAccount = await getAssociatedTokenAddress(
      mintKeyPair.publicKey,
      payer.publicKey // Owner of the token account
    );

    console.log(`✅ Associated Token Account: ${associatedTokenAccount.toBase58()}`);

    // Create the associated token account (ATA)
    await createAssociatedTokenAccount(
      provider.connection,
      payer.payer, // Pass the Signer instead of PublicKey
      mintKeyPair.publicKey,
      payer.publicKey
    );

    console.log("✅ Associated Token Account Created");

    // Mint tokens to the associated token account
    const amountToMint = 1_000_000_000; // 1 token (decimals = 9)
    await mintTo(
      provider.connection,
      payer.payer, // Pass the Signer instead of PublicKey
      mintKeyPair.publicKey,
      associatedTokenAccount,
      payer.publicKey,
      amountToMint
    );

    console.log(`✅ Minted ${amountToMint} tokens to ${associatedTokenAccount.toBase58()}`);
  });
});
