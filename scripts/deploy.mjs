// Deploy CinchClearing to Tempo Moderato and record the address in .env.local.
// Run with: node scripts/deploy.mjs   (needs CINCH_DEPLOYER_KEY in env/.env.local)
//
// Steps: fund the deployer via Tempo's programmatic faucet (best-effort), deploy
// the compiled contract as a standard create tx (fee auto-paid in pathUSD), wait
// for the receipt, and write NEXT_PUBLIC_CINCH_CLEARING_ADDRESS.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { tempoModerato } from "viem/chains";
import { createClient, http as tempoHttp, Account, Actions } from "viem/tempo";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const RPC = "https://rpc.moderato.tempo.xyz";
const PATH_USD = "0x20c0000000000000000000000000000000000000";

// Load CINCH_DEPLOYER_KEY from env or .env.local.
function deployerKey() {
  if (process.env.CINCH_DEPLOYER_KEY) return process.env.CINCH_DEPLOYER_KEY.trim();
  const envPath = join(root, ".env.local");
  if (existsSync(envPath)) {
    const m = readFileSync(envPath, "utf8").match(/^CINCH_DEPLOYER_KEY=(.+)$/m);
    if (m) return m[1].trim();
  }
  return null;
}

const key = deployerKey();
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
  console.error("Missing CINCH_DEPLOYER_KEY. Run `node scripts/gen-deployer.mjs` first.");
  process.exit(1);
}

const artifact = JSON.parse(readFileSync(join(root, "src", "lib", "clearingArtifact.json"), "utf8"));
const account = privateKeyToAccount(key);
console.log("Deployer:", account.address);

// 1. Fund the deployer (best-effort — if it's already funded or the faucet is
//    rate-limited, continue and let the deploy surface any real shortfall).
try {
  const tempoClient = createClient({
    account: Account.fromSecp256k1(key),
    chain: tempoModerato,
    transport: tempoHttp(RPC),
  });
  console.log("Requesting faucet funds…");
  await Actions.faucet.fundSync(tempoClient, { account: account.address });
  console.log("  funded.");
} catch (err) {
  console.warn("  faucet skipped:", (err?.message ?? String(err)).split("\n")[0]);
  console.warn("  If the deploy fails for funds, faucet", account.address, "at https://faucet.tempo.xyz");
}

// 2. Deploy as a standard create tx; Tempo cascades the fee to pathUSD.
const wallet = createWalletClient({ account, chain: tempoModerato, transport: http(RPC) });
const pub = createPublicClient({ chain: tempoModerato, transport: http(RPC) });

console.log("Deploying CinchClearing…");
const hash = await wallet.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode,
  // Pay the deploy fee in pathUSD (Tempo has no native gas token).
  feeToken: PATH_USD,
});
console.log("  tx:", hash);
const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
if (receipt.status !== "success" || !receipt.contractAddress) {
  console.error("Deploy reverted or produced no address.");
  process.exit(1);
}
const address = receipt.contractAddress;
console.log("  deployed at:", address);

// 3. Record the address for the app.
const envPath = join(root, ".env.local");
let env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
if (/^NEXT_PUBLIC_CINCH_CLEARING_ADDRESS=.*$/m.test(env)) {
  env = env.replace(/^NEXT_PUBLIC_CINCH_CLEARING_ADDRESS=.*$/m, `NEXT_PUBLIC_CINCH_CLEARING_ADDRESS=${address}`);
} else {
  env += `${env.endsWith("\n") || env === "" ? "" : "\n"}NEXT_PUBLIC_CINCH_CLEARING_ADDRESS=${address}\n`;
}
writeFileSync(envPath, env);
console.log(`\nWrote NEXT_PUBLIC_CINCH_CLEARING_ADDRESS to .env.local`);
console.log("Verify with: forge verify-contract --verifier-url https://contracts.tempo.xyz", address, "CinchClearing");
