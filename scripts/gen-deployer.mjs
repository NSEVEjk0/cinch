// Generate a fresh deployer keypair for CinchClearing.
// Prints the address to fund (faucet.tempo.xyz) and the key line to add to
// .env.local. Run with: node scripts/gen-deployer.mjs
//
// The deployer is a one-off *root* key (Tempo requires a root key to create
// contracts). Keep it out of git — it only ever holds testnet funds.

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const key = generatePrivateKey();
const account = privateKeyToAccount(key);

console.log("Deployer generated.\n");
console.log("  address: ", account.address);
console.log("  key:     ", key);
console.log("\nAdd this line to /root/cinch/.env.local (do not commit it):\n");
console.log(`  CINCH_DEPLOYER_KEY=${key}`);
console.log("\nThen fund the address with pathUSD at https://faucet.tempo.xyz");
console.log("(the deploy script will also try Tempo's programmatic faucet).");
