# Cinch

**Net it out. Settle the whole circle in one move.**

Cinch is a multilateral netting clearinghouse on [Tempo](https://tempo.xyz).
Drop in who owes whom, and it collapses a tangle of debts into the fewest
possible transfers — then settles the entire cleared circle as a single atomic
transaction. Nobody goes first. Nobody is left short.

**Live:** https://cinch-tau.vercel.app

---

## The problem

When several parties owe each other — a DAO and its contributors, suppliers in
a chain, friends after a trip — the obligations loop. A owes B, B owes C, C owes
A. Paid one by one, that is a flurry of transfers for almost no change in
anyone's real position. The only tools that fix it today are a bank's internal
ledger or a trusted spreadsheet, and someone always has to go first.

## How it works

1. **Open a circle.** Make a room, add the parties, drop in each obligation —
   who owes whom, how much, and what it is for.
2. **Net it out.** Cinch computes everyone's net position and the minimal set of
   transfers that discharges every debt. A balanced loop collapses to nothing;
   an unbalanced one shrinks to a handful of payments.
3. **Settle atomically.** The whole cleared circle goes out as one Tempo
   transaction. Every leg settles or none does.

## What makes it hold

- **One atomic settlement.** The entire cleared circle is a single Tempo batch —
  it clears every leg together or does nothing at all. No risky escrow, no
  going first.
- **Liquidity-aware clearing.** If a party cannot fund their net position
  on-chain, Cinch settles the largest sub-circle everyone present can cover
  rather than failing the whole round.
- **Standing circles.** A DAO, a market, or a fleet can accumulate obligations
  across a period and net + settle on a cadence.
- **Multi-stablecoin netting.** Obligations in different stablecoins net through
  Tempo's enshrined stablecoin exchange inside one settlement.
- **Reconciles itself.** Every settled leg carries the invoice references it
  discharges in its on-chain memo.
- **Disputes don't block.** Flag an obligation and it is held out of the round;
  the rest still clears.

## Why Tempo

| Primitive | How Cinch uses it |
| --- | --- |
| Atomic batched transactions | The whole cleared circle settles as one transaction — the foundation of trust-free netting. |
| `transferWithMemo` | Each leg carries the obligation references it discharges, so settlement is also reconciliation. |
| Stablecoin-native fees | Fees are paid in the stablecoin being settled — no separate gas token to hold. |
| Fee sponsorship | A circle's organiser can sponsor the clearing round. |
| Enshrined stablecoin DEX | Obligations in different stablecoins net against one another. |
| Sub-second finality | A cleared circle is final in about half a second. |

## Networks

Cinch defaults to the **Moderato testnet** (chain 42431) so nothing real moves
while you explore. Point it at mainnet (chain 4217) with
`NEXT_PUBLIC_CINCH_NETWORK=mainnet`.

## The netting engine

The core (`src/lib/netting.ts`) is pure, deterministic `bigint` logic:

- Nets every party's position per settlement token.
- Produces a provably near-minimal transfer set (greedy min-cash-flow — at most
  *n−1* transfers for *n* active parties).
- Attaches the discharged obligation references to each transfer for the memo.
- Trims to on-chain liquidity and excludes disputed obligations.

It is covered by a full unit suite — run `npm test`.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # the netting engine + encoding suite
npm run build
```

## Stack

Next.js (App Router) · TypeScript · wagmi + viem · Tempo. No backend, no
custody — a circle lives in your browser and the only durable record of a
settlement is the Tempo chain itself.
