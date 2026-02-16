/**
 * Deploy a send-many-ft contract customized for a specific SIP-010 token.
 *
 * Usage:
 *   bun run deploy-ft.ts <token-contract> <token-name> [contract-suffix]
 *
 * Example:
 *   bun run deploy-ft.ts SP3NE50GEXFG9SZGTT51P40X2CKYSZ5CC4ZTZ7A2G.welshcorgicoin-token welshcorgicoin welsh
 *
 * This will:
 * 1. Read contracts/send-many-ft.clar template
 * 2. Replace .token-placeholder with the target contract
 * 3. Replace TOKEN_NAME with the FT name
 * 4. Deploy as send-many-ft-<suffix> (or send-many-ft-<hash> if no suffix)
 */

import { readFileSync } from "fs";
import {
  makeContractDeploy,
  broadcastTransaction,
  AnchorMode,
} from "@stacks/transactions";
import { StacksMainnet } from "@stacks/network";

const [tokenContract, tokenName, suffix] = process.argv.slice(2);

if (!tokenContract || !tokenName) {
  console.error(
    "Usage: bun run deploy-ft.ts <token-contract> <token-name> [contract-suffix]"
  );
  console.error(
    "Example: bun run deploy-ft.ts SP3NE50GEXFG9SZGTT51P40X2CKYSZ5CC4ZTZ7A2G.welshcorgicoin-token welshcorgicoin welsh"
  );
  process.exit(1);
}

// Validate token contract format
if (!tokenContract.match(/^SP[A-Z0-9]+\.[a-z0-9-]+$/)) {
  console.error(`Invalid token contract format: ${tokenContract}`);
  console.error("Expected: SP<address>.<contract-name>");
  process.exit(1);
}

// Read template
let source = readFileSync("contracts/send-many-ft.clar", "utf-8");

// Replace placeholders
// .token-placeholder -> 'SP...contract (fully qualified)
source = source.replace(
  /\.token-placeholder/g,
  `'${tokenContract}`
);

// TOKEN_NAME -> actual token name
source = source.replace(
  /\(define-constant TOKEN_NAME "fungible-token"\)/,
  `(define-constant TOKEN_NAME "${tokenName}")`
);

// Generate contract name
const contractSuffix = suffix || tokenContract.split(".")[1].slice(0, 20);
const contractName = `send-many-ft-${contractSuffix}`;

console.log(`Token contract: ${tokenContract}`);
console.log(`Token name:     ${tokenName}`);
console.log(`Deploy as:      ${contractName}`);
console.log(`---`);
console.log(source.slice(0, 500) + "\n...");

// Uncomment below to actually deploy:
// const DEPLOYER_KEY = process.env.DEPLOYER_KEY;
// if (!DEPLOYER_KEY) {
//   console.error("Set DEPLOYER_KEY env var");
//   process.exit(1);
// }
// const network = new StacksMainnet();
// const tx = await makeContractDeploy({
//   contractName,
//   codeBody: source,
//   senderKey: DEPLOYER_KEY,
//   network,
//   anchorMode: AnchorMode.Any,
//   clarityVersion: 4,
// });
// const result = await broadcastTransaction({ transaction: tx, network });
// console.log("Broadcast result:", result);
