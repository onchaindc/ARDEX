import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Ardex } from "../target/types/ardex";

describe("ardex", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.Ardex as Program<Ardex>;

  it("loads the program workspace", async () => {
    if (!program.programId) {
      throw new Error("Program ID missing");
    }
  });
});
