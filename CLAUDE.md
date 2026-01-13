# Airdrop Cannon

Mass token distribution as a service. Pay once, reach thousands.

Inspired by [AIBTC's record-breaking Stacks airdrop](https://www.hiro.so/blog/how-aibtc-and-bitcoin-faces-launched-the-biggest-airdrop-in-stacks-history).

## What It Does

1. Accept a list of recipients + amounts
2. Batch into optimal transaction sizes (~500 per tx)
3. Execute via send-many contract
4. Track status and provide tx hashes

## Technical Approach

### Batch Optimization
- Max 500 recipients per transaction
- Uses `fold` for iteration (like AIBTC approach)
- Stays well under Stacks' 15,000 read limit per block

### Contract: `send-many.clar`
- Minimal contract, lists passed as arguments
- Three list params (200 + 200 + 100) for flexibility
- Direct `stx-transfer?` calls

### Pricing
- 100 µSTX per recipient (service fee)
- ~0.01 STX per batch (tx fees)
- Example: 10,000 recipients = ~1 STX service + ~0.2 STX fees

## API Endpoints

- `POST /quote` - Get pricing for an airdrop
- `POST /execute` - Submit airdrop job
- `GET /job/:id` - Check status
- `GET /stats` - Platform stats

## Stack

- Runtime: Cloudflare Workers
- Framework: Hono
- Database: D1 + KV
- Contract: Clarity (send-many pattern)
- Payment: x402

## Commands

```bash
cd ~/dev/personal/airdrop-cannon && bun run dev
```

## Bun Defaults

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install`
- Use `bun run <script>` instead of `npm run <script>`
- Bun automatically loads .env, so don't use dotenv.
