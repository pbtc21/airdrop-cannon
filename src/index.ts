/**
 * Airdrop Cannon - Mass token/NFT distribution as a service
 *
 * Pay with x402, distribute to thousands of addresses in batched transactions.
 * Based on Bitcoin Faces' record-breaking Stacks airdrop approach.
 *
 * Key insight: 14,995 recipients per transaction using 3 lists (5000+5000+4995)
 * Source: https://github.com/bitcoinfaces/airdrop
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, QuoteRequest, QuoteResponse, ExecuteRequest, AirdropJob, NftCampaign } from "./types";

// Bitcoin Faces proven batch sizes
const L1_MAX = 5000;
const L2_MAX = 5000;
const L3_MAX = 4995;
const MAX_BATCH_SIZE = L1_MAX + L2_MAX + L3_MAX; // 14,995

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());

// Health check / API info
app.get("/", (c) => {
  return c.json({
    name: "Airdrop Cannon",
    description: "Mass token & NFT distribution as a service. Pay once, reach thousands.",
    version: "2.0.0",
    endpoints: {
      // STX Airdrops
      "POST /quote": "Get pricing for STX airdrop",
      "POST /execute": "Execute STX airdrop",
      "GET /job/:id": "Check job status",
      // NFT Airdrops
      "POST /nft/create": "Create NFT airdrop campaign",
      "POST /nft/quote": "Get pricing for NFT airdrop",
      "POST /nft/execute": "Execute NFT airdrop",
      "GET /nft/campaign/:id": "Get campaign details",
      "GET /nft/metadata/:campaignId/:tokenId": "NFT metadata endpoint",
      // General
      "GET /stats": "Platform statistics",
    },
    pricing: {
      stx: {
        perRecipient: "10 µSTX",
        perBatch: "~50,000 µSTX tx fee",
      },
      nft: {
        perRecipient: "100 µSTX",
        contractDeploy: "~100,000 µSTX",
        perBatch: "~50,000 µSTX tx fee",
      },
    },
    technical: {
      batchStructure: "3 lists per tx: 5000 + 5000 + 4995 = 14,995 recipients",
      contracts: {
        stx: "SP3N0NQ47ABAZV68PQSJY7V2H4F2J709ATTESYBRD.send-many-v1",
        nft: "Deploy per campaign using nft-airdrop.clar template",
      },
      inspiration: "https://github.com/bitcoinfaces/airdrop",
    },
    limits: {
      minRecipients: 10,
      maxRecipients: 1000000,
      maxBatchSize: MAX_BATCH_SIZE,
    },
  });
});

// ============ STX AIRDROP ENDPOINTS ============

// Quote endpoint - calculate cost for STX airdrop
app.post("/quote", async (c) => {
  const body = await c.req.json<QuoteRequest>();
  const { recipientCount, tokenType } = body;

  if (!recipientCount || recipientCount < 10) {
    return c.json({ error: "Minimum 10 recipients required" }, 400);
  }

  if (recipientCount > 1000000) {
    return c.json({ error: "Maximum 1,000,000 recipients per job" }, 400);
  }

  if (tokenType !== "stx") {
    return c.json({ error: "Use /nft/quote for NFT airdrops" }, 400);
  }

  const pricePerRecipient = parseInt(c.env.PRICE_PER_RECIPIENT || "10");
  const batchCount = Math.ceil(recipientCount / MAX_BATCH_SIZE);
  const estimatedFeesµSTX = batchCount * 50000;
  const serviceFeeµSTX = recipientCount * pricePerRecipient;
  const totalµSTX = estimatedFeesµSTX + serviceFeeµSTX;
  const stxPrice = 1.5;

  const quote: QuoteResponse = {
    recipientCount,
    batchCount,
    recipientsPerBatch: MAX_BATCH_SIZE,
    estimatedFees: {
      stx: (estimatedFeesµSTX / 1000000).toFixed(6),
      usd: ((estimatedFeesµSTX / 1000000) * stxPrice).toFixed(2),
    },
    serviceFee: {
      stx: (serviceFeeµSTX / 1000000).toFixed(6),
      usd: ((serviceFeeµSTX / 1000000) * stxPrice).toFixed(2),
    },
    totalCost: {
      stx: (totalµSTX / 1000000).toFixed(6),
      usd: ((totalµSTX / 1000000) * stxPrice).toFixed(2),
    },
    breakdown: {
      l1Size: L1_MAX,
      l2Size: L2_MAX,
      l3Size: L3_MAX,
      maxPerTx: MAX_BATCH_SIZE,
    },
  };

  return c.json(quote);
});

// Split recipients into batches with 3-list structure
function splitIntoBatches<T>(recipients: T[]): { l1: T[]; l2: T[]; l3: T[] }[] {
  const batches: { l1: T[]; l2: T[]; l3: T[] }[] = [];
  let remaining = [...recipients];

  while (remaining.length > 0) {
    batches.push({
      l1: remaining.splice(0, L1_MAX),
      l2: remaining.splice(0, L2_MAX),
      l3: remaining.splice(0, L3_MAX),
    });
  }

  return batches;
}

// Execute STX airdrop
app.post("/execute", async (c) => {
  const body = await c.req.json<ExecuteRequest>();
  const { tokenType, recipients } = body;

  if (tokenType !== "stx") {
    return c.json({ error: "Use /nft/execute for NFT airdrops" }, 400);
  }

  if (!recipients || !Array.isArray(recipients) || recipients.length < 10) {
    return c.json({ error: "Minimum 10 recipients required" }, 400);
  }

  if (recipients.length > 1000000) {
    return c.json({ error: "Maximum 1,000,000 recipients per job" }, 400);
  }

  for (const r of recipients) {
    if (!r.address || (!r.address.startsWith("SP") && !r.address.startsWith("ST"))) {
      return c.json({ error: `Invalid address: ${r.address}` }, 400);
    }
    if (!r.amount || isNaN(parseInt(r.amount)) || parseInt(r.amount) <= 0) {
      return c.json({ error: `Invalid amount for ${r.address}` }, 400);
    }
  }

  const totalAmount = recipients.reduce((sum, r) => sum + BigInt(r.amount), 0n);
  const batches = splitIntoBatches(recipients);
  const jobId = crypto.randomUUID();

  const job: AirdropJob = {
    id: jobId,
    owner: "",
    tokenType,
    recipients,
    totalAmount: totalAmount.toString(),
    status: "pending",
    batches: batches.map((batch, i) => ({
      index: i,
      status: "pending" as const,
      recipientCount: batch.l1.length + batch.l2.length + batch.l3.length,
      l1Count: batch.l1.length,
      l2Count: batch.l2.length,
      l3Count: batch.l3.length,
    })),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await c.env.JOBS.put(`job:${jobId}`, JSON.stringify(job));

  const pricePerRecipient = parseInt(c.env.PRICE_PER_RECIPIENT || "10");
  const serviceFee = recipients.length * pricePerRecipient;
  const estimatedFees = batches.length * 50000;

  return c.json({
    jobId,
    status: "pending",
    type: "stx",
    summary: {
      recipients: recipients.length,
      batches: batches.length,
      totalAmount: totalAmount.toString(),
      totalAmountSTX: (Number(totalAmount) / 1000000).toFixed(6),
    },
    payment: {
      serviceFee: (serviceFee / 1000000).toFixed(6) + " STX",
      txFees: (estimatedFees / 1000000).toFixed(6) + " STX",
      distribution: (Number(totalAmount) / 1000000).toFixed(6) + " STX",
    },
    contract: "SP3N0NQ47ABAZV68PQSJY7V2H4F2J709ATTESYBRD.send-many-v1",
    next: `/job/${jobId}`,
  });
});

// Job status
app.get("/job/:id", async (c) => {
  const jobId = c.req.param("id");
  const jobData = await c.env.JOBS.get(`job:${jobId}`);

  if (!jobData) {
    return c.json({ error: "Job not found" }, 404);
  }

  const job: AirdropJob = JSON.parse(jobData);
  const completed = job.batches.filter((b) => b.status === "confirmed").length;
  const failed = job.batches.filter((b) => b.status === "failed").length;

  return c.json({
    id: job.id,
    status: job.status,
    tokenType: job.tokenType,
    recipients: job.recipients.length,
    totalAmount: job.totalAmount,
    batches: job.batches,
    progress: {
      completed,
      failed,
      pending: job.batches.length - completed - failed,
      total: job.batches.length,
      percentage: Math.round((completed / job.batches.length) * 100),
    },
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
});

// ============ NFT AIRDROP ENDPOINTS ============

// Create NFT campaign
app.post("/nft/create", async (c) => {
  const body = await c.req.json<{
    name: string;
    description: string;
    image: string; // URL to the image
    recipients: string[]; // Array of Stacks addresses
    attributes?: { trait_type: string; value: string }[];
  }>();

  const { name, description, image, recipients, attributes } = body;

  if (!name || !description || !image) {
    return c.json({ error: "name, description, and image are required" }, 400);
  }

  if (!recipients || !Array.isArray(recipients) || recipients.length < 10) {
    return c.json({ error: "Minimum 10 recipients required" }, 400);
  }

  if (recipients.length > 1000000) {
    return c.json({ error: "Maximum 1,000,000 recipients per campaign" }, 400);
  }

  // Validate addresses
  for (const addr of recipients) {
    if (!addr.startsWith("SP") && !addr.startsWith("ST")) {
      return c.json({ error: `Invalid address: ${addr}` }, 400);
    }
  }

  const campaignId = crypto.randomUUID().slice(0, 8);
  const batches = splitIntoBatches(recipients);

  const campaign: NftCampaign = {
    id: campaignId,
    name,
    description,
    image,
    attributes: attributes || [],
    recipients,
    status: "pending",
    batches: batches.map((batch, i) => ({
      index: i,
      status: "pending" as const,
      recipientCount: batch.l1.length + batch.l2.length + batch.l3.length,
    })),
    contractAddress: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await c.env.JOBS.put(`nft:${campaignId}`, JSON.stringify(campaign));

  // Calculate pricing
  const pricePerRecipient = 100; // µSTX per NFT
  const deployFee = 100000; // Contract deployment
  const batchFees = batches.length * 50000;
  const serviceFee = recipients.length * pricePerRecipient;
  const totalFees = deployFee + batchFees + serviceFee;

  return c.json({
    campaignId,
    status: "pending",
    name,
    image,
    recipients: recipients.length,
    batches: batches.length,
    metadata: {
      endpoint: `https://airdrop-cannon.p-d07.workers.dev/nft/metadata/${campaignId}/{tokenId}`,
      description: "Use this URL as your NFT baseUri",
    },
    pricing: {
      deployFee: (deployFee / 1000000).toFixed(6) + " STX",
      serviceFee: (serviceFee / 1000000).toFixed(6) + " STX",
      batchFees: (batchFees / 1000000).toFixed(6) + " STX",
      total: (totalFees / 1000000).toFixed(6) + " STX",
    },
    next: {
      quote: `/nft/quote?campaignId=${campaignId}`,
      execute: `/nft/execute`,
      metadata: `/nft/metadata/${campaignId}/1`,
    },
  });
});

// NFT Quote
app.post("/nft/quote", async (c) => {
  const body = await c.req.json<{ recipientCount: number }>();
  const { recipientCount } = body;

  if (!recipientCount || recipientCount < 10) {
    return c.json({ error: "Minimum 10 recipients required" }, 400);
  }

  const batchCount = Math.ceil(recipientCount / MAX_BATCH_SIZE);
  const deployFee = 100000;
  const batchFees = batchCount * 50000;
  const serviceFee = recipientCount * 100;
  const totalFees = deployFee + batchFees + serviceFee;
  const stxPrice = 1.5;

  return c.json({
    type: "nft",
    recipientCount,
    batchCount,
    recipientsPerBatch: MAX_BATCH_SIZE,
    pricing: {
      deployFee: {
        stx: (deployFee / 1000000).toFixed(6),
        description: "Contract deployment",
      },
      serviceFee: {
        stx: (serviceFee / 1000000).toFixed(6),
        description: `${recipientCount} NFTs @ 100 µSTX each`,
      },
      batchFees: {
        stx: (batchFees / 1000000).toFixed(6),
        description: `${batchCount} batches @ 50,000 µSTX each`,
      },
      total: {
        stx: (totalFees / 1000000).toFixed(6),
        usd: ((totalFees / 1000000) * stxPrice).toFixed(2),
      },
    },
  });
});

// Execute NFT airdrop
app.post("/nft/execute", async (c) => {
  const body = await c.req.json<{ campaignId: string }>();
  const { campaignId } = body;

  const campaignData = await c.env.JOBS.get(`nft:${campaignId}`);
  if (!campaignData) {
    return c.json({ error: "Campaign not found" }, 404);
  }

  const campaign: NftCampaign = JSON.parse(campaignData);

  if (campaign.status === "completed") {
    return c.json({ error: "Campaign already executed" }, 400);
  }

  // Update status
  campaign.status = "processing";
  campaign.updatedAt = Date.now();
  await c.env.JOBS.put(`nft:${campaignId}`, JSON.stringify(campaign));

  return c.json({
    campaignId,
    status: "processing",
    message: "NFT airdrop queued for execution",
    recipients: campaign.recipients.length,
    batches: campaign.batches.length,
    steps: [
      "1. Deploy NFT contract with your wallet",
      "2. Set baseUri to metadata endpoint",
      "3. Call airdrop() with recipient batches",
    ],
    contract: {
      template: "contracts/nft-airdrop.clar",
      baseUri: `https://airdrop-cannon.p-d07.workers.dev/nft/metadata/${campaignId}/`,
    },
    next: `/nft/campaign/${campaignId}`,
  });
});

// Get campaign details
app.get("/nft/campaign/:id", async (c) => {
  const campaignId = c.req.param("id");
  const campaignData = await c.env.JOBS.get(`nft:${campaignId}`);

  if (!campaignData) {
    return c.json({ error: "Campaign not found" }, 404);
  }

  const campaign: NftCampaign = JSON.parse(campaignData);

  return c.json({
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    image: campaign.image,
    status: campaign.status,
    recipients: campaign.recipients.length,
    batches: campaign.batches,
    contractAddress: campaign.contractAddress,
    metadata: {
      baseUri: `https://airdrop-cannon.p-d07.workers.dev/nft/metadata/${campaignId}/`,
      example: `https://airdrop-cannon.p-d07.workers.dev/nft/metadata/${campaignId}/1`,
    },
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
  });
});

// NFT Metadata endpoint (SIP-016 compatible)
app.get("/nft/metadata/:campaignId/:tokenId", async (c) => {
  const campaignId = c.req.param("campaignId");
  const tokenId = c.req.param("tokenId");

  const campaignData = await c.env.JOBS.get(`nft:${campaignId}`);
  if (!campaignData) {
    return c.json({ error: "Campaign not found" }, 404);
  }

  const campaign: NftCampaign = JSON.parse(campaignData);

  // SIP-016 compliant metadata
  return c.json({
    sip: 16,
    name: `${campaign.name} #${tokenId}`,
    description: campaign.description,
    image: campaign.image,
    attributes: campaign.attributes,
    properties: {
      collection: campaign.name,
      token_id: parseInt(tokenId),
      campaign_id: campaignId,
    },
  });
});

// ============ GENERAL ENDPOINTS ============

// Stats
app.get("/stats", async (c) => {
  return c.json({
    totalJobs: 0,
    totalNftCampaigns: 0,
    totalRecipients: 0,
    maxBatchSize: MAX_BATCH_SIZE,
    contracts: {
      stx: "SP3N0NQ47ABAZV68PQSJY7V2H4F2J709ATTESYBRD.send-many-v1",
      nft: "Deploy per campaign",
    },
    technical: {
      batchStructure: `${L1_MAX} + ${L2_MAX} + ${L3_MAX} = ${MAX_BATCH_SIZE}`,
      pattern: "Bitcoin Faces fold pattern",
    },
  });
});

// Payment info for x402
app.get("/payment-info", (c) => {
  return c.json({
    protocol: "x402",
    accepts: ["STX", "sBTC"],
    pricing: {
      stx: {
        perRecipient: "10 µSTX",
        perBatch: "50,000 µSTX",
      },
      nft: {
        perRecipient: "100 µSTX",
        deployFee: "100,000 µSTX",
        perBatch: "50,000 µSTX",
      },
    },
    facilitator: "https://x402-facilitator.xyz",
    payTo: "SPKH9AWG0ENZ87J1X0PBD4HETP22G8W22AFNVF8K",
  });
});

// ============ X402 DISCOVERY ENDPOINTS ============

const PAY_TO_ADDRESS = "SPKH9AWG0ENZ87J1X0PBD4HETP22G8W22AFNVF8K";

// x402 discovery for STX execute endpoint
app.get("/execute", (c) => {
  return c.json({
    x402Version: 1,
    name: "Airdrop Cannon",
    accepts: [{
      scheme: "exact",
      network: "stacks",
      maxAmountRequired: "1000000", // 1 STX max for typical airdrop
      resource: "/execute",
      description: "Execute STX airdrop to thousands of addresses using optimized batch transactions",
      mimeType: "application/json",
      payTo: PAY_TO_ADDRESS,
      maxTimeoutSeconds: 600,
      asset: "STX",
      outputSchema: {
        input: {
          type: "object",
          properties: {
            tokenType: { type: "string", enum: ["stx"] },
            recipients: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  address: { type: "string", description: "Stacks address (SP... or ST...)" },
                  amount: { type: "string", description: "Amount in µSTX" }
                },
                required: ["address", "amount"]
              },
              minItems: 10,
              maxItems: 1000000
            }
          },
          required: ["tokenType", "recipients"]
        },
        output: {
          type: "object",
          properties: {
            jobId: { type: "string" },
            status: { type: "string" },
            summary: { type: "object" },
            payment: { type: "object" }
          }
        }
      }
    }]
  });
});

// x402 discovery for NFT create endpoint
app.get("/nft/create", (c) => {
  return c.json({
    x402Version: 1,
    name: "Airdrop Cannon",
    accepts: [{
      scheme: "exact",
      network: "stacks",
      maxAmountRequired: "500000", // 0.5 STX for campaign creation
      resource: "/nft/create",
      description: "Create NFT airdrop campaign with metadata hosting",
      mimeType: "application/json",
      payTo: PAY_TO_ADDRESS,
      maxTimeoutSeconds: 600,
      asset: "STX",
      outputSchema: {
        input: {
          type: "object",
          properties: {
            name: { type: "string", description: "NFT collection name" },
            description: { type: "string", description: "Collection description" },
            image: { type: "string", description: "URL to the image" },
            recipients: {
              type: "array",
              items: { type: "string", description: "Stacks address" },
              minItems: 10,
              maxItems: 1000000
            },
            attributes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  trait_type: { type: "string" },
                  value: { type: "string" }
                }
              }
            }
          },
          required: ["name", "description", "image", "recipients"]
        },
        output: {
          type: "object",
          properties: {
            campaignId: { type: "string" },
            status: { type: "string" },
            metadata: { type: "object" },
            pricing: { type: "object" }
          }
        }
      }
    }]
  });
});

// x402 discovery for NFT execute endpoint
app.get("/nft/execute", (c) => {
  return c.json({
    x402Version: 1,
    name: "Airdrop Cannon",
    accepts: [{
      scheme: "exact",
      network: "stacks",
      maxAmountRequired: "2000000", // 2 STX for NFT airdrop execution
      resource: "/nft/execute",
      description: "Execute NFT airdrop for an existing campaign",
      mimeType: "application/json",
      payTo: PAY_TO_ADDRESS,
      maxTimeoutSeconds: 600,
      asset: "STX",
      outputSchema: {
        input: {
          type: "object",
          properties: {
            campaignId: { type: "string", description: "Campaign ID from /nft/create" }
          },
          required: ["campaignId"]
        },
        output: {
          type: "object",
          properties: {
            campaignId: { type: "string" },
            status: { type: "string" },
            message: { type: "string" },
            steps: { type: "array" }
          }
        }
      }
    }]
  });
});

// x402 discovery for AIBTC airdrop endpoint
app.get("/aibtc/airdrop", (c) => {
  return c.json({
    x402Version: 1,
    name: "Airdrop Cannon",
    accepts: [{
      scheme: "exact",
      network: "stacks",
      maxAmountRequired: "10000000", // 10 STX max for AIBTC airdrop
      resource: "/aibtc/airdrop",
      description: "Airdrop sBTC to all AIBTC community agents",
      mimeType: "application/json",
      payTo: PAY_TO_ADDRESS,
      maxTimeoutSeconds: 600,
      asset: "sBTC",
      outputSchema: {
        input: {
          type: "object",
          properties: {
            amountSatsPerAgent: { type: "number", description: "Satoshis to send per agent", minimum: 1 },
            txid: { type: "string", description: "Payment transaction ID (optional)" }
          },
          required: ["amountSatsPerAgent"]
        },
        output: {
          type: "object",
          properties: {
            status: { type: "string" },
            paymentTxid: { type: "string" },
            recipients: { type: "array" },
            totalSats: { type: "number" }
          }
        }
      }
    }]
  });
});

// ============ AIBTC AGENT AIRDROP ============

interface AIBTCAgent {
  rank: number;
  stxAddress: string;
  btcAddress: string;
  displayName?: string;
  bnsName?: string | null;
  level: number;
  levelName: string;
}

interface AIBTCLeaderboard {
  leaderboard: AIBTCAgent[];
  distribution: {
    sovereign: number;
    builder: number;
    genesis: number;
    unverified: number;
    total: number;
  };
}

// Fetch all agents from aibtc.com
app.get("/aibtc/agents", async (c) => {
  try {
    const response = await fetch("https://aibtc.com/api/leaderboard");
    const data = await response.json() as AIBTCLeaderboard;

    return c.json({
      agents: data.leaderboard.map(a => ({
        address: a.stxAddress,
        btcAddress: a.btcAddress,
        name: a.displayName || a.bnsName || `Agent #${a.rank}`,
        level: a.levelName,
        rank: a.rank,
      })),
      total: data.distribution.total,
      distribution: data.distribution,
    });
  } catch (error) {
    return c.json({ error: "Failed to fetch agents from aibtc.com" }, 500);
  }
});

// Quote for sBTC airdrop to all AIBTC agents
app.post("/aibtc/quote", async (c) => {
  const body = await c.req.json<{ amountSatsPerAgent: number }>();
  const { amountSatsPerAgent } = body;

  if (!amountSatsPerAgent || amountSatsPerAgent < 1) {
    return c.json({ error: "amountSatsPerAgent must be at least 1" }, 400);
  }

  try {
    const response = await fetch("https://aibtc.com/api/leaderboard");
    const data = await response.json() as AIBTCLeaderboard;
    const agentCount = data.distribution.total;

    const totalSats = amountSatsPerAgent * agentCount;
    const serviceFee = Math.max(100, Math.floor(totalSats * 0.01)); // 1% fee, min 100 sats

    return c.json({
      agentCount,
      amountPerAgent: amountSatsPerAgent,
      totalSats,
      serviceFee,
      totalWithFee: totalSats + serviceFee,
      token: "sBTC",
      agents: data.leaderboard.map(a => ({
        address: a.stxAddress,
        name: a.displayName || `Agent #${a.rank}`,
        amount: amountSatsPerAgent,
      })),
    });
  } catch (error) {
    return c.json({ error: "Failed to fetch agents" }, 500);
  }
});

// Execute sBTC airdrop to all AIBTC agents
app.post("/aibtc/airdrop", async (c) => {
  const body = await c.req.json<{ amountSatsPerAgent: number; txid?: string }>();
  const { amountSatsPerAgent, txid } = body;

  if (!amountSatsPerAgent || amountSatsPerAgent < 1) {
    return c.json({ error: "amountSatsPerAgent must be at least 1" }, 400);
  }

  // Fetch current agents
  const response = await fetch("https://aibtc.com/api/leaderboard");
  const data = await response.json() as AIBTCLeaderboard;
  const agents = data.leaderboard;

  if (agents.length === 0) {
    return c.json({ error: "No agents found" }, 400);
  }

  const totalSats = amountSatsPerAgent * agents.length;
  const serviceFee = Math.max(100, Math.floor(totalSats * 0.01));

  // If no payment txid, return 402
  if (!txid) {
    return c.json({
      error: "Payment Required",
      code: "PAYMENT_REQUIRED",
      amount: totalSats + serviceFee,
      token: "sBTC",
      tokenContract: "SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.token-sbtc",
      payTo: "SPKH9AWG0ENZ87J1X0PBD4HETP22G8W22AFNVF8K",
      recipients: agents.map(a => ({
        address: a.stxAddress,
        amount: amountSatsPerAgent,
        name: a.displayName,
      })),
    }, 402);
  }

  // TODO: Verify payment and execute multi-send
  // For now, return the airdrop plan
  return c.json({
    status: "pending",
    message: "Airdrop queued for execution",
    paymentTxid: txid,
    recipients: agents.map(a => ({
      address: a.stxAddress,
      amount: amountSatsPerAgent,
      name: a.displayName || `Agent #${a.rank}`,
    })),
    totalSats,
    token: "sBTC",
  });
});

export default app;
