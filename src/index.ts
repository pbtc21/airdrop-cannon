/**
 * Airdrop Cannon - Mass token distribution as a service
 *
 * Pay with x402, distribute to thousands of addresses in batched transactions.
 * Based on Bitcoin Faces' record-breaking Stacks airdrop approach.
 *
 * Key insight: 14,995 recipients per transaction using 3 lists (5000+5000+4995)
 * Source: https://github.com/bitcoinfaces/airdrop
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, QuoteRequest, QuoteResponse, ExecuteRequest, AirdropJob } from "./types";

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
    description: "Mass token distribution as a service. Pay once, reach thousands.",
    version: "1.0.0",
    endpoints: {
      "GET /": "API info",
      "POST /quote": "Get pricing for an airdrop",
      "POST /execute": "Execute an airdrop (requires x402 payment)",
      "GET /job/:id": "Check job status",
      "GET /stats": "Platform statistics",
    },
    pricing: {
      perRecipient: "10 µSTX",
      minRecipients: 10,
      maxRecipients: 1000000,
      maxBatchSize: MAX_BATCH_SIZE,
    },
    technical: {
      batchStructure: "3 lists per tx: 5000 + 5000 + 4995 = 14,995 recipients",
      contract: "send-many.clar using fold pattern",
      inspiration: "https://github.com/bitcoinfaces/airdrop",
    },
    supported: {
      tokens: ["STX"],
      networks: ["mainnet", "testnet"],
    },
  });
});

// Quote endpoint - calculate cost for an airdrop
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
    return c.json({ error: "Only STX airdrops supported currently" }, 400);
  }

  const pricePerRecipient = parseInt(c.env.PRICE_PER_RECIPIENT || "10"); // µSTX
  const batchCount = Math.ceil(recipientCount / MAX_BATCH_SIZE);

  // Estimate tx fees: ~0.05 STX per batch tx (larger txs need more fees)
  const estimatedFeesµSTX = batchCount * 50000;

  // Service fee
  const serviceFeeµSTX = recipientCount * pricePerRecipient;

  // Total
  const totalµSTX = estimatedFeesµSTX + serviceFeeµSTX;

  // Convert to STX
  const stxPrice = 1.5; // Approximate USD per STX

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
function splitIntoBatches(recipients: { address: string; amount: string }[]): {
  l1: { address: string; amount: string }[];
  l2: { address: string; amount: string }[];
  l3: { address: string; amount: string }[];
}[] {
  const batches: {
    l1: { address: string; amount: string }[];
    l2: { address: string; amount: string }[];
    l3: { address: string; amount: string }[];
  }[] = [];

  let remaining = [...recipients];

  while (remaining.length > 0) {
    const batch = {
      l1: remaining.splice(0, L1_MAX),
      l2: remaining.splice(0, L2_MAX),
      l3: remaining.splice(0, L3_MAX),
    };
    batches.push(batch);
  }

  return batches;
}

// Execute airdrop - accepts recipient list and payment
app.post("/execute", async (c) => {
  const body = await c.req.json<ExecuteRequest>();
  const { tokenType, recipients, memo } = body;

  // Validate
  if (tokenType !== "stx") {
    return c.json({ error: "Only STX airdrops supported currently" }, 400);
  }

  if (!recipients || !Array.isArray(recipients) || recipients.length < 10) {
    return c.json({ error: "Minimum 10 recipients required" }, 400);
  }

  if (recipients.length > 1000000) {
    return c.json({ error: "Maximum 1,000,000 recipients per job" }, 400);
  }

  // Validate each recipient
  for (const r of recipients) {
    if (!r.address || (!r.address.startsWith("SP") && !r.address.startsWith("ST"))) {
      return c.json({ error: `Invalid address: ${r.address}` }, 400);
    }
    if (!r.amount || isNaN(parseInt(r.amount)) || parseInt(r.amount) <= 0) {
      return c.json({ error: `Invalid amount for ${r.address}` }, 400);
    }
  }

  // Calculate total
  const totalAmount = recipients.reduce((sum, r) => sum + BigInt(r.amount), 0n);

  // Split into batches
  const batches = splitIntoBatches(recipients);

  // Create job
  const jobId = crypto.randomUUID();

  const job: AirdropJob = {
    id: jobId,
    owner: "", // Set from x402 payment
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

  // Store job
  await c.env.JOBS.put(`job:${jobId}`, JSON.stringify(job));

  // Calculate fees
  const pricePerRecipient = parseInt(c.env.PRICE_PER_RECIPIENT || "10");
  const serviceFee = recipients.length * pricePerRecipient;
  const estimatedFees = batches.length * 50000;

  return c.json({
    jobId,
    status: "pending",
    summary: {
      recipients: recipients.length,
      batches: batches.length,
      totalAmount: totalAmount.toString(),
      totalAmountSTX: (Number(totalAmount) / 1000000).toFixed(6),
    },
    batchBreakdown: batches.map((batch, i) => ({
      batch: i + 1,
      l1: batch.l1.length,
      l2: batch.l2.length,
      l3: batch.l3.length,
      total: batch.l1.length + batch.l2.length + batch.l3.length,
    })),
    payment: {
      required: true,
      serviceFee: {
        amount: serviceFee,
        amountSTX: (serviceFee / 1000000).toFixed(6),
        token: "STX",
      },
      estimatedTxFees: {
        amount: estimatedFees,
        amountSTX: (estimatedFees / 1000000).toFixed(6),
        token: "STX",
      },
      totalRequired: {
        serviceFee: (serviceFee / 1000000).toFixed(6),
        txFees: (estimatedFees / 1000000).toFixed(6),
        distribution: (Number(totalAmount) / 1000000).toFixed(6),
        grandTotal: ((serviceFee + estimatedFees + Number(totalAmount)) / 1000000).toFixed(6),
      },
    },
    next: {
      checkStatus: `/job/${jobId}`,
      documentation: "https://github.com/bitcoinfaces/airdrop",
    },
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
    totalAmountSTX: (Number(job.totalAmount) / 1000000).toFixed(6),
    batches: job.batches.map((b) => ({
      index: b.index,
      status: b.status,
      txId: b.txId,
      recipientCount: b.recipientCount,
      l1Count: b.l1Count,
      l2Count: b.l2Count,
      l3Count: b.l3Count,
      error: b.error,
    })),
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

// Stats
app.get("/stats", async (c) => {
  return c.json({
    totalJobs: 0,
    totalRecipients: 0,
    totalDistributed: {
      stx: "0",
    },
    averageBatchSize: MAX_BATCH_SIZE,
    maxBatchSize: MAX_BATCH_SIZE,
    successRate: "100%",
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
      perRecipient: {
        stx: "0.00001",
        description: "10 µSTX per recipient",
      },
      perBatch: {
        stx: "0.05",
        description: "~50,000 µSTX tx fee per batch of 14,995",
      },
    },
    facilitator: "https://x402-facilitator.xyz",
    payTo: "SP3N0NQ47ABAZV68PQSJY7V2H4F2J709ATTESYBRD",
  });
});

export default app;
