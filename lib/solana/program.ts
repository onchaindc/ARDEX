import { PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";

export const ARDEX_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_ARDEX_PROGRAM_ID ?? "11111111111111111111111111111111"
);

export async function derivePositionPda(owner: string, positionId: string): Promise<string> {
  const ownerKey = new PublicKey(owner);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), ownerKey.toBuffer(), Buffer.from(positionId.slice(0, 24))],
    ARDEX_PROGRAM_ID
  );

  return pda.toBase58();
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}
