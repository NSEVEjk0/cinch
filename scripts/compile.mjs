// Compile contracts/CinchClearing.sol with solc and emit ABI + bytecode to
// src/lib/clearingArtifact.json. Run with: node scripts/compile.mjs
//
// solc is a build-time tool only — install it on demand with
//   npm install --no-save solc@0.8.28
// It is intentionally not a committed dependency of the app.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const solc = require("solc");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "contracts", "CinchClearing.sol"), "utf8");

const input = {
  language: "Solidity",
  sources: { "CinchClearing.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    // Tempo targets the Osaka fork; a Cancun-compiled contract runs fine there
    // and keeps us off bleeding-edge solc evmVersion names.
    evmVersion: "cancun",
    outputSelection: {
      "*": { "*": ["abi", "evm.bytecode.object"] },
    },
  },
};

const out = JSON.parse(solc.compile(JSON.stringify(input)));

const errors = (out.errors ?? []).filter((e) => e.severity === "error");
if (errors.length) {
  for (const e of errors) console.error(e.formattedMessage);
  process.exit(1);
}
for (const w of out.errors ?? []) console.warn(w.formattedMessage);

const artifact = out.contracts["CinchClearing.sol"].CinchClearing;
const result = {
  contractName: "CinchClearing",
  abi: artifact.abi,
  bytecode: "0x" + artifact.evm.bytecode.object,
  compiler: solc.version(),
  evmVersion: "cancun",
};

const outPath = join(root, "src", "lib", "clearingArtifact.json");
writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n");
console.log(`Compiled CinchClearing (${result.compiler})`);
console.log(`  abi entries: ${result.abi.length}`);
console.log(`  bytecode:    ${(result.bytecode.length - 2) / 2} bytes`);
console.log(`  -> ${outPath}`);
