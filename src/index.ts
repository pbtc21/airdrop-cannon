/**
 * Airdrop Cannon - Mass token distribution as a service
 *
 * Pay with x402, distribute to thousands of addresses in batched transactions.
 * Inspired by AIBTC's record-breaking Stacks airdrop.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, QuoteRequest, QuoteResponse, ExecuteRequest, AirdropJob, AirdropRecipient } from "./types";

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
      perRecipient: "100 µSTX",
      minRecipients: 10,
      maxRecipients: 100000,
      maxBatchSize: 500,
    },
    supported: {
      tokens: ["STX", "SIP-010 (coming soon)"],
      networks: ["mainnet", "testnet"],
    },
    inspired_by: "https://www.hiro.so/blog/how-aibtc-and-bitcoin-faces-launched-the-biggest-airdrop-in-stacks-history",
  });
});

// Quote endpoint - calculate cost for an airdrop
app.post("/quote", async (c) => {
  const body = await c.req.json<QuoteRequest>();
  const { recipientCount, tokenType } = body;

  if (!recipientCount || recipientCount < 10) {
    return c.json({ error: "Minimum 10 recipients required" }, 400);
  }

  if (recipientCount > 100000) {
    return c.json({ error: "Maximum 100,000 recipients per job" }, 400);
  }

  if (tokenType !== "stx") {
    return c.json({ error: "Only STX airdrops supported currently" }, 400);
  }

  const maxBatchSize = parseInt(c.env.MAX_BATCH_SIZE || "500");
  const pricePerRecipient = parseInt(c.env.PRICE_PER_RECIPIENT || "100"); // µSTX
  const batchCount = Math.ceil(recipientCount / maxBatchSize);

  // Estimate tx fees: ~0.01 STX per batch tx
  const estimatedFeesµSTX = batchCount * 10000;

  // Service fee
  const serviceFeeµSTX = recipientCount * pricePerRecipient;

  // Total
  const totalµSTX = estimatedFeesµSTX + serviceFeeµSTX;

  // Convert to STX (rough)
  const stxPrice = 1.5; // Approximate USD per STX

  const quote: QuoteResponse = {
    recipientCount,
    batchCount,
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
    maxBatchSize,
  };

  return c.json(quote);
});

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

  if (recipients.length > 100000) {
    return c.json({ error: "Maximum 100,000 recipients per job" }, 400);
  }

  // Validate each recipient
  for (const r of recipients) {
    if (!r.address || !r.address.startsWith("SP")) {
      return c.json({ error: `Invalid address: ${r.address}` }, 400);
    }
    if (!r.amount || isNaN(parseInt(r.amount)) || parseInt(r.amount) <= 0) {
      return c.json({ error: `Invalid amount for ${r.address}` }, 400);
    }
  }

  // Calculate total
  const totalAmount = recipients.reduce((sum, r) => sum + BigInt(r.amount), 0n);

  // Create job
  const jobId = crypto.randomUUID();
  const maxBatchSize = parseInt(c.env.MAX_BATCH_SIZE || "500");
  const batchCount = Math.ceil(recipients.length / maxBatchSize);

  const job: AirdropJob = {
    id: jobId,
    owner: "", // Would be set from x402 payment
    tokenType,
    recipients,
    totalAmount: totalAmount.toString(),
    status: "pending",
    batches: Array.from({ length: batchCount }, (_, i) => ({
      index: i,
      status: "pending" as const,
      recipientCount: Math.min(maxBatchSize, recipients.length - i * maxBatchSize),
    })),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Store job
  await c.env.JOBS.put(`job:${jobId}`, JSON.stringify(job));

  // Return job info with payment instructions
  const pricePerRecipient = parseInt(c.env.PRICE_PER_RECIPIENT || "100");
  const serviceFee = recipients.length * pricePerRecipient;
  const estimatedFees = batchCount * 10000;

  return c.json({
    jobId,
    status: "pending",
    recipients: recipients.length,
    batches: batchCount,
    totalAmount: totalAmount.toString(),
    payment: {
      required: true,
      serviceFee: {
        amount: serviceFee,
        token: "µSTX",
      },
      estimatedTxFees: {
        amount: estimatedFees,
        token: "µSTX",
      },
      instructions: "Pay service fee + provide STX for distribution. Job will process after payment confirmation.",
    },
    next: {
      checkStatus: `/job/${jobId}`,
      paymentEndpoint: "x402 payment required - see /payment-info",
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

  return c.json({
    id: job.id,
    status: job.status,
    tokenType: job.tokenType,
    recipients: job.recipients.length,
    totalAmount: job.totalAmount,
    batches: job.batches.map((b) => ({
      index: b.index,
      status: b.status,
      txId: b.txId,
      recipientCount: b.recipientCount,
      error: b.error,
    })),
    progress: {
      completed: job.batches.filter((b) => b.status === "confirmed").length,
      total: job.batches.length,
      percentage: Math.round(
        (job.batches.filter((b) => b.status === "confirmed").length / job.batches.length) * 100
      ),
    },
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
});

// Stats
app.get("/stats", async (c) => {
  // Would pull from D1 in production
  return c.json({
    totalJobs: 0,
    totalRecipients: 0,
    totalDistributed: {
      stx: "0",
    },
    averageBatchSize: 0,
    successRate: "100%",
  });
});

// Payment info for x402
app.get("/payment-info", (c) => {
  return c.json({
    protocol: "x402",
    accepts: ["STX", "sBTC"],
    pricing: {
      perRecipient: {
        stx: "0.0001",
        description: "100 µSTX per recipient",
      },
    },
    facilitator: "https://x402-facilitator.xyz",
    payTo: "SP...", // Service wallet
  });
});

export default app;
