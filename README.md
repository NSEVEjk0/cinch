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

- **One atomic settlement.** The entire cleared circle settles together or does
  nothing at all — no risky escrow, no going first. When one account owes the
  circle, that is a single Tempo batch; when several independent parties each owe
  (a real multilateral circle), it is one call to the on-chain clearing contract
  (see below).
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

## How a circle settles

A cleared round is a set of transfers, each `from` a net debtor `to` a net
creditor. Who signs depends on how many distinct debtors there are:

- **One payer** (a treasury, a payroll account, an organiser who already holds
  the funds) → that account signs one atomic Tempo batch. One signature, done.
- **Several payers** (a genuine multilateral circle — a trip, a DAO and its
  contributors) → no single key can move everyone's money, so Cinch uses the
  **CinchClearing** contract (`contracts/CinchClearing.sol`). Each net debtor
  signs two things off-chain, costing nothing and moving nothing:
  1. an **EIP-2612 `permit`** granting the contract an allowance for their net
     amount;
  2. an **EIP-712 `Authorization`** binding them to the exact, whole leg set.

  The organiser then submits a single `clear()` that pulls every leg
  debtor→creditor with `transferFromWithMemo`. Because each signature commits to
  the hash of the entire ordered leg set, no amount and no recipient can be
  altered after signing — and the whole circle settles in one transaction or
  reverts. Nobody goes first; nobody is left short. The flow is proven
  end-to-end against the live Moderato testnet in `test/clearing.onchain.test.ts`.

  ```bash
  npm run contract:compile        # solc -> src/lib/clearingArtifact.json
  npm run contract:gen-deployer   # a fresh root key to fund (faucet.tempo.xyz)
  npm run contract:deploy         # deploy + record NEXT_PUBLIC_CINCH_CLEARING_ADDRESS
  npm run test:onchain            # live multi-party clear() on Moderato
  ```

  Set `NEXT_PUBLIC_CINCH_CLEARING_ADDRESS` (locally in `.env.local`, and in your
  Vercel project env) to enable multi-party clearing in the app.

## Why Tempo

| Primitive | How Cinch uses it |
| --- | --- |
| Atomic batched transactions | The whole cleared circle settles as one transaction — the foundation of trust-free netting. |
| `transferWithMemo` | Each leg carries the obligation references it discharges, so settlement is also reconciliation. |
| `transferFromWithMemo` + EIP-2612 `permit` | The clearing contract pulls each debtor's pre-authorized funds, memo attached, so several parties settle atomically from one call. |
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
