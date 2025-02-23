import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaToy } from "../target/types/solana_toy";

describe("solana-toy", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.SolanaToy as Program<SolanaToy>;

  it("Is initialized!", async () => {
    const tx = await program.methods.initialize().rpc();
    console.log("Your transaction signature:", tx);

    const connection = anchor.getProvider().connection;

    // Wait a few seconds before fetching logs (needed for local validator)
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const txInfo = await connection.getTransaction(tx, {
      commitment: "finalized",
    });

    if (txInfo?.meta?.logMessages) {
      console.log("Program Logs:");
      console.log(txInfo.meta.logMessages.join("\n"));
    } else {
      console.log("No logs found. Try increasing the wait time.");
    }
  });
});
