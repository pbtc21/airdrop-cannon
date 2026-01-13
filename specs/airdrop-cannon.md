# Spec: Airdrop Cannon

## Problem

Airdrops on Stacks are painful. Sending tokens to 100 people means 100 separate transactions, each requiring gas, each taking time. Want to airdrop to 10,000 holders? That's days of work and hundreds of dollars in fees.

AIBTC and Bitcoin Faces solved this by discovering you can batch up to **14,995 recipients in a single transaction** using Clarity's `fold` pattern. But their solution requires technical knowledge to execute.

## Solution

Airdrop Cannon is mass token distribution as a service. Pay once, reach thousands.

Upload a list of recipients, we handle the batching, contract calls, and transaction broadcasting. Works for both STX transfers and NFT mints.

## Core Features

### STX Batch Transfers
- Send STX to up to 14,995 addresses per transaction
- Automatic batching for larger lists
- Uses the proven Bitcoin Faces 3-list pattern (5000 + 5000 + 4995)

### NFT Airdrops
- Mint unique NFTs to thousands of recipients
- One contract deployment per campaign
- SIP-009 compliant (tradeable on marketplaces)
- Dynamic metadata via API endpoint

### Batch Optimization
The magic number is 14,995. Clarity limits us to ~15,000 read operations per block. The 3-list structure maximizes throughput while staying safe:

```
List 1: 5,000 recipients
List 2: 5,000 recipients
List 3: 4,995 recipients
─────────────────────────
Total:  14,995 per transaction
```

## API Endpoints

### STX Airdrops
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/quote` | POST | Get pricing for recipient count |
| `/execute` | POST | Submit airdrop job |
| `/job/:id` | GET | Check job status |
| `/stats` | GET | Platform statistics |

### NFT Airdrops
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/nft/create` | POST | Create campaign with metadata |
| `/nft/quote` | POST | Get pricing |
| `/nft/execute/:id` | POST | Deploy contract and mint |
| `/nft/campaign/:id` | GET | Campaign status |
| `/nft/metadata/:campaignId/:tokenId` | GET | SIP-016 metadata |

## Smart Contracts

### `send-many.clar`
Batch STX transfers. Deployed once, used by everyone.

```clarity
(define-public (send-many
  (l1 (list 5000 {to: principal, amount: uint}))
  (l2 (list 5000 {to: principal, amount: uint}))
  (l3 (list 4995 {to: principal, amount: uint})))
```

### `nft-airdrop.clar`
Template for NFT campaigns. Deployed fresh per campaign.

```clarity
(define-public (airdrop
  (l1 (list 5000 principal))
  (l2 (list 5000 principal))
  (l3 (list 4995 principal)))
```

## Pricing Model

| Component | Cost |
|-----------|------|
| Service fee | 100 µSTX per recipient |
| Transaction fee | ~0.05 STX per batch |
| Contract deploy (NFT) | ~0.1 STX |

**Example: 10,000 STX airdrop**
- Service: 1 STX (10,000 × 100 µSTX)
- Tx fees: ~0.05 STX (1 batch)
- **Total: ~1.05 STX**

**Example: 10,000 NFT airdrop**
- Service: 1 STX
- Deploy: ~0.1 STX
- Tx fees: ~0.1 STX (set URI + mint)
- **Total: ~1.2 STX**

## NFT Metadata (SIP-016)

Each NFT gets unique metadata served via API:

```json
{
  "sip": 16,
  "name": "Campaign Name #42",
  "description": "Airdropped NFT",
  "image": "https://example.com/image.png",
  "attributes": [
    {"trait_type": "Campaign", "value": "Launch Day"},
    {"trait_type": "Token ID", "value": "42"}
  ]
}
```

## Deployed Infrastructure

### Contracts (Mainnet)
- `SP3N0NQ47ABAZV68PQSJY7V2H4F2J709ATTESYBRD.send-many-v1`
- NFT contracts deployed per campaign (e.g., `nft-airdrop-5e477c68`)

### API
- `https://airdrop-cannon.p-d07.workers.dev`

### Storage
- D1 database for job tracking
- KV for campaign metadata

## Out of Scope (v1)

- SIP-010 fungible token airdrops (STX only for now)
- Merkle proof claims (push model only)
- Vesting schedules
- Multi-sig approval flows

## Success Criteria

1. Successfully airdrop to 10,000+ recipients in single transaction
2. NFT airdrops appear correctly on Gamma/marketplaces
3. Sub-second quote responses
4. <5 minute end-to-end for 10k recipient airdrop

## Technical Notes

### Why Three Lists?
Clarity has no unbounded loops. The `fold` function iterates over lists, but list sizes are fixed at compile time. By accepting three lists as parameters, we can process 14,995 items while the contract code stays simple.

### Error Handling
The `send-stx` helper ignores individual transfer failures to prevent one bad address from failing the entire batch. Failed transfers simply don't execute.

### NFT Contract Per Campaign
Each NFT campaign gets its own contract because:
1. Token IDs start fresh at 1
2. Metadata URI is campaign-specific
3. Ownership is clear
4. No cross-campaign conflicts

## Credits

Based on the [Bitcoin Faces Airdrop](https://github.com/bitcoinfaces/airdrop) pattern that powered [AIBTC's record-breaking airdrop](https://www.hiro.so/blog/how-aibtc-and-bitcoin-faces-launched-the-biggest-airdrop-in-stacks-history) - 1.3M recipients across 103 transactions.
