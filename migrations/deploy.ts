import * as anchor from "@coral-xyz/anchor";

module.exports = async function deploy(provider: anchor.AnchorProvider) {
  anchor.setProvider(provider);
  console.log("ARDEX deploy hook ready for devnet.");
};
