/**
 * Test send-many contract with a small batch
 */

import {
  makeContractCall,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  listCV,
  tupleCV,
  standardPrincipalCV,
  uintCV,
} from "@stacks/transactions";
import { STACKS_MAINNET } from "@stacks/network";

const CONTRACT_ADDRESS = "SP3N0NQ47ABAZV68PQSJY7V2H4F2J709ATTESYBRD";
const CONTRACT_NAME = "send-many-v1";
const PRIVATE_KEY = process.env.STACKS_PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error("Missing STACKS_PRIVATE_KEY environment variable");
  process.exit(1);
}

// Test recipients - sending 1000 µSTX (0.001 STX) to each
const testRecipients = [
  { to: "SP2QXPFF4M72QYZWXE7S5321XJDJ2DD32DGEMN5QA", amount: 1000 }, // Registry wallet
  { to: "SP1734723Q6206N1BAWQCJ5H9YFQBEPB96DRQB7KC", amount: 1000 }, // Another address
  { to: "SPP5ZMH9NQDFD2K5CEQZ6P02AP8YPWMQ75TJW20M", amount: 1000 }, // Another address
];

// Convert to Clarity list format
const makeRecipientCV = (r: { to: string; amount: number }) =>
  tupleCV({
    to: standardPrincipalCV(r.to),
    amount: uintCV(r.amount),
  });

// Build lists (l1 has recipients, l2 and l3 are empty)
const l1 = listCV(testRecipients.map(makeRecipientCV));
const l2 = listCV([]); // Empty
const l3 = listCV([]); // Empty

console.log("Testing send-many contract...");
console.log("Contract:", `${CONTRACT_ADDRESS}.${CONTRACT_NAME}`);
console.log("Recipients:", testRecipients.length);
console.log("Total amount:", testRecipients.reduce((sum, r) => sum + r.amount, 0), "µSTX");

const txOptions = {
  contractAddress: CONTRACT_ADDRESS,
  contractName: CONTRACT_NAME,
  functionName: "send-many",
  functionArgs: [l1, l2, l3],
  senderKey: PRIVATE_KEY,
  network: STACKS_MAINNET,
  anchorMode: AnchorMode.Any,
  postConditionMode: PostConditionMode.Allow, // Allow for testing
  fee: 10000n, // 0.01 STX
};

try {
  const tx = await makeContractCall(txOptions);
  console.log("Transaction created, broadcasting...");

  const result = await broadcastTransaction({ transaction: tx, network: STACKS_MAINNET });

  if ("error" in result) {
    console.error("Broadcast failed:", result.error);
    console.error("Reason:", result.reason);
    process.exit(1);
  }

  console.log("\n=== TEST TRANSACTION SENT ===");
  console.log("TX ID:", result.txid);
  console.log("Explorer: https://explorer.hiro.so/txid/" + result.txid + "?chain=mainnet");
} catch (err) {
  console.error("Error:", err);
  process.exit(1);
}
