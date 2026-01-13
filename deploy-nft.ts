/**
 * Deploy NFT airdrop contract and execute airdrop
 */

import {
  makeContractDeploy,
  makeContractCall,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  ClarityVersion,
  listCV,
  standardPrincipalCV,
  stringAsciiCV,
} from "@stacks/transactions";
import { STACKS_MAINNET } from "@stacks/network";

const PRIVATE_KEY = process.env.STACKS_PRIVATE_KEY;
const CAMPAIGN_ID = "5e477c68";
const CONTRACT_NAME = `nft-airdrop-${CAMPAIGN_ID}`;

if (!PRIVATE_KEY) {
  console.error("Missing STACKS_PRIVATE_KEY");
  process.exit(1);
}

// Recipients from the campaign
const recipients = [
  "SP3N0NQ47ABAZV68PQSJY7V2H4F2J709ATTESYBRD",
  "SP2QXPFF4M72QYZWXE7S5321XJDJ2DD32DGEMN5QA",
  "SP1734723Q6206N1BAWQCJ5H9YFQBEPB96DRQB7KC",
  "SPP5ZMH9NQDFD2K5CEQZ6P02AP8YPWMQ75TJW20M",
  "SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE",
  "SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR",
  "SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9",
  "SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7",
  "SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1",
  "SP2KAF9RF86PVX3NEE27DFV1CQX0T4WGR41X3S45C",
];

const contractSource = await Bun.file("./contracts/nft-airdrop.clar").text();

console.log("=== NFT AIRDROP DEPLOYMENT ===");
console.log("Campaign:", CAMPAIGN_ID);
console.log("Contract:", CONTRACT_NAME);
console.log("Recipients:", recipients.length);
console.log("");

// Step 1: Deploy contract
console.log("Step 1: Deploying NFT contract...");

const deployTx = await makeContractDeploy({
  contractName: CONTRACT_NAME,
  codeBody: contractSource,
  senderKey: PRIVATE_KEY,
  network: STACKS_MAINNET,
  anchorMode: AnchorMode.Any,
  postConditionMode: PostConditionMode.Deny,
  fee: 100000n,
  clarityVersion: ClarityVersion.Clarity2,
});

const deployResult = await broadcastTransaction({ transaction: deployTx, network: STACKS_MAINNET });

if ("error" in deployResult) {
  console.error("Deploy failed:", deployResult.error, deployResult.reason);
  process.exit(1);
}

console.log("Deploy TX:", deployResult.txid);
console.log("Explorer: https://explorer.hiro.so/txid/" + deployResult.txid + "?chain=mainnet");
console.log("");
console.log("Waiting 10 seconds for deployment to propagate...");
await new Promise((r) => setTimeout(r, 10000));

// Get deployer address
const { getAddressFromPrivateKey, TransactionVersion } = await import("@stacks/transactions");
const deployerAddress = getAddressFromPrivateKey(PRIVATE_KEY, TransactionVersion.Mainnet);

// Step 2: Set base URI
console.log("Step 2: Setting base URI...");

const baseUri = `https://airdrop-cannon.p-d07.workers.dev/nft/metadata/${CAMPAIGN_ID}/`;

const setUriTx = await makeContractCall({
  contractAddress: deployerAddress,
  contractName: CONTRACT_NAME,
  functionName: "set-base-uri",
  functionArgs: [stringAsciiCV(baseUri)],
  senderKey: PRIVATE_KEY,
  network: STACKS_MAINNET,
  anchorMode: AnchorMode.Any,
  postConditionMode: PostConditionMode.Deny,
  fee: 10000n,
});

const setUriResult = await broadcastTransaction({ transaction: setUriTx, network: STACKS_MAINNET });

if ("error" in setUriResult) {
  console.error("Set URI failed:", setUriResult.error, setUriResult.reason);
  process.exit(1);
}

console.log("Set URI TX:", setUriResult.txid);
console.log("");
console.log("Waiting 5 seconds...");
await new Promise((r) => setTimeout(r, 5000));

// Step 3: Execute airdrop
console.log("Step 3: Executing airdrop...");

const l1 = listCV(recipients.map((r) => standardPrincipalCV(r)));
const l2 = listCV([]);
const l3 = listCV([]);

const airdropTx = await makeContractCall({
  contractAddress: deployerAddress,
  contractName: CONTRACT_NAME,
  functionName: "airdrop",
  functionArgs: [l1, l2, l3],
  senderKey: PRIVATE_KEY,
  network: STACKS_MAINNET,
  anchorMode: AnchorMode.Any,
  postConditionMode: PostConditionMode.Deny,
  fee: 50000n,
});

const airdropResult = await broadcastTransaction({ transaction: airdropTx, network: STACKS_MAINNET });

if ("error" in airdropResult) {
  console.error("Airdrop failed:", airdropResult.error, airdropResult.reason);
  process.exit(1);
}

console.log("Airdrop TX:", airdropResult.txid);
console.log("Explorer: https://explorer.hiro.so/txid/" + airdropResult.txid + "?chain=mainnet");
console.log("");
console.log("=== AIRDROP COMPLETE ===");
console.log("Contract:", `${deployerAddress}.${CONTRACT_NAME}`);
console.log("NFTs minted:", recipients.length);
console.log("Metadata:", baseUri);
