export interface Env {
  DB: D1Database;
  JOBS: KVNamespace;
  NETWORK: string;
  MAX_BATCH_SIZE: string;
  PRICE_PER_RECIPIENT: string;
  CANNON_PRIVATE_KEY?: string;
}

export interface AirdropRecipient {
  address: string;
  amount: string; // in micro units
}

export interface AirdropJob {
  id: string;
  owner: string;
  tokenType: "stx" | "sip010";
  tokenContract?: string; // for SIP-010
  recipients: AirdropRecipient[];
  totalAmount: string;
  status: "pending" | "processing" | "completed" | "failed";
  batches: BatchStatus[];
  createdAt: number;
  updatedAt: number;
  paymentTxId?: string;
}

export interface BatchStatus {
  index: number;
  txId?: string;
  status: "pending" | "broadcast" | "confirmed" | "failed";
  recipientCount: number;
  l1Count?: number;
  l2Count?: number;
  l3Count?: number;
  error?: string;
}

export interface QuoteRequest {
  tokenType: "stx" | "sip010";
  tokenContract?: string;
  recipientCount: number;
}

export interface QuoteResponse {
  recipientCount: number;
  batchCount: number;
  recipientsPerBatch: number;
  estimatedFees: {
    stx: string;
    usd: string;
  };
  serviceFee: {
    stx: string;
    usd: string;
  };
  totalCost: {
    stx: string;
    usd: string;
  };
  breakdown: {
    l1Size: number;
    l2Size: number;
    l3Size: number;
    maxPerTx: number;
  };
}

export interface ExecuteRequest {
  tokenType: "stx" | "sip010";
  tokenContract?: string;
  recipients: AirdropRecipient[];
  memo?: string;
}

// Bitcoin Faces batch structure
export interface AirdropBatch {
  l1: AirdropRecipient[];
  l2: AirdropRecipient[];
  l3: AirdropRecipient[];
}
