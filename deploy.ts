/**
 * Deploy send-many contract to Stacks mainnet
 */

import {
  makeContractDeploy,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  ClarityVersion,
} from "@stacks/transactions";
import { STACKS_MAINNET } from "@stacks/network";

const CONTRACT_NAME = "send-many-v1";
const PRIVATE_KEY = process.env.STACKS_PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error("Missing STACKS_PRIVATE_KEY environment variable");
  process.exit(1);
}

const contractSource = await Bun.file("./contracts/send-many.clar").text();

console.log("Deploying send-many contract to mainnet...");
console.log("Contract name:", CONTRACT_NAME);
console.log("Contract size:", contractSource.length, "bytes");

const txOptions = {
  contractName: CONTRACT_NAME,
  codeBody: contractSource,
  senderKey: PRIVATE_KEY,
  network: STACKS_MAINNET,
  anchorMode: AnchorMode.Any,
  postConditionMode: PostConditionMode.Deny,
  fee: 50000n, // 0.05 STX
  clarityVersion: ClarityVersion.Clarity2,
};

try {
  const tx = await makeContractDeploy(txOptions);
  console.log("Transaction created, broadcasting...");

  const result = await broadcastTransaction({ transaction: tx, network: STACKS_MAINNET });

  if ("error" in result) {
    console.error("Broadcast failed:", result.error);
    console.error("Reason:", result.reason);
    process.exit(1);
  }

  console.log("\n=== DEPLOYMENT SUCCESSFUL ===");
  console.log("TX ID:", result.txid);
  console.log("Explorer: https://explorer.hiro.so/txid/" + result.txid + "?chain=mainnet");
} catch (err) {
  console.error("Deployment error:", err);
  process.exit(1);
}
