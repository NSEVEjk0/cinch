# Cinch

**Net it out. Settle the whole circle in one move.**

Cinch is a multilateral netting clearinghouse on [Tempo](https://tempo.xyz).
Drop in who owes whom, and it collapses a tangle of debts into the fewest
possible transfers — then settles the entire cleared circle as a single atomic
transaction. Nobody goes first. Nobody is left short.

**Live:** https://cinch-tau.vercel.app

---

## The problem

### 1. The core problem: trapped capital in commercial networks

Everyday commerce creates inevitable circular obligations (A → B → C → A).
Yet most businesses still settle bilaterally — paying every invoice in full,
one transfer at a time. This leaves huge offsets on the table and creates
severe drag:

- **Sequencing risk:** "Who pays first?" concerns delay settlements and freeze
  working capital across the chain.
- **Wasted liquidity:** Un-netted obligations require larger cash buffers,
  higher transaction volume, and elevated borrowing costs.
- **Operational drag:** Manual reconciliation and isolated invoice disputes
  often stall entire settlement cycles.

### 2. How banks & CLS solve it (and their limitations)

To eliminate this friction, global banking and institutional markets rely on
centralized multilateral netting:

- **How they do it:** Institutional clearinghouses — such as CLS (for foreign
  exchange) and CHIPS (for interbank payments) — aggregate cross-market
  obligations and run centralized compression algorithms. Instead of settling
  gross amounts, they compress positions into tiny net balances, routinely
  reducing liquidity requirements by over 90%.
- **The limitations:**
  - **Closed & exclusive:** designed strictly for regulated financial
    institutions, major corporations, or internal intercompany treasuries.
  - **Central counterparty risk:** relies on heavy, centralized intermediaries
    (and novation) that introduce single points of failure, administrative
    overhead, and high fees.
  - **Opaque & inflexible:** operationally heavy, requiring centralized
    custodianship and slow batch processes that are completely impractical for
    open supply chains, small businesses, or freelancers.

### 3. Why Cinch is better

Cinch brings institutional-grade multilateral netting to any open commercial
network without the traditional gatekeepers:

- **Permissionless & accessible:** unlocks enterprise clearinghouse dynamics
  for ordinary suppliers, buyers, and freelancers exchanging real-world
  invoices.
- **Atomic multi-party settlement:** resolves complex debt cycles
  simultaneously in a single, trustless transaction. No one has to go first,
  eliminating sequencing risk and counterparty default.
- **Self-custodial & cheap (via Tempo):** powered by Tempo, Cinch executes
  high-speed, low-cost atomic cycles on-chain. Capital stays in user control
  rather than locked inside centralized settlement systems.
- **Resilient to disputes:** single-invoice disagreements can be cleanly
  isolated, ensuring un-disputed obligations clear smoothly without freezing
  the entire network's liquidity.
- **Built-in auditability:** every settlement carries on-chain invoice
  references, simplifying reconciliation and accounting automatically.

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
- **Multi-stablecoin netting.** Obligations in different stablecoins net per
  token inside one settlement, and a payer who holds the wrong stablecoin can
  convert it at Tempo's enshrined stablecoin exchange with one tap.
- **Reconciles itself.** Every settled leg carries the invoice references it
  discharges in its on-chain memo.
- **Disputes don't block.** Flag an obligation and it is held out of the round;
  the rest still clears.

## How a circle settles

A cleared round is a set of transfers, each `from` a net debtor `to` a net
creditor. Who signs depends on how many distinct debtors there are:

- **One payer** (a treasury, a payroll account, an organiser who already holds
  the funds) → that account signs one atomic Tempo batch. One signature, done.
- **Several payers** (a genuine multilateral circle — a trading network, a DAO
  and its contributors) → no single key can move everyone's money, so Cinch uses
  the **CinchClearing** contract (`contracts/CinchClearing.sol`). Each net debtor
  signs two things off-chain, costing nothing and moving nothing:
  1. an **EIP-2612 `permit`** granting the contract an allowance for their net
     amount;
  2. an **EIP-712 `Authorization`** binding them to the exact, whole leg set.

Each payer signs with **their own wallet** — connect an existing one
(MetaMask/Rabby/EIP-6963) or use the built-in self-custodial Cinch account; both
produce the same EIP-712 signatures. Obligations may be denominated in **several
Tempo stablecoins** at once: the engine nets per token and a single `clear()`
settles the mixed-token legs together. If a payer owes in a stablecoin they
don't hold, Cinch offers a **one-tap conversion** through Tempo's enshrined
orderbook DEX (`STABLECOIN_DEX`): it quotes the live rate, then swaps the
payer's surplus stablecoin into the one they owe — as a single sponsored atomic
batch (approve + swap) — so the payment is funded before they authorize. See
`src/lib/crossCurrency.ts`.

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

## Cinch Agent — the clearing house that runs itself

The agent economy is coming: agents that book, buy, and hire other agents on
our behalf. When one agent delivers a service, it bills the other, and that
debt needs clearing. **Cinch Agent** watches the web of obligations, nets it,
and settles the whole circle atomically — under policy, with receipts, and zero
human babysitting.

### The problem

Paid one-by-one, agent micro-debts stretch capital thin: every payment ties up
funds in transit, fragments balances across dozens of counterparties, and burns
fees at every hop. The more agents trade, the more of their capital is stuck in
motion instead of doing work.

### How it works

1. **Agents transact & bill** — one agent delivers a service (a data feed, a
   subtask, an API call) and bills the other. The debt is recorded on-chain,
   signed by the debtor.
2. **Cinch Agent watches** — it reads the open obligations, computes the
   minimal multilateral settlement, and checks every net debtor is funded.
3. **Settles under standing policy** — participants sign one standing
   authorization: a policy capping their net debit per round. From then on the
   agent settles rounds without asking again, atomically, on Tempo.

### The standing-authorization primitive

The contract's `clearWithStanding` is what makes autonomous settlement safe:

- **Pre-authorized, not pre-funded.** A standing authorization is a signed
  EIP-712 policy, not custody. The agent can net a payer into any round up to
  their cap — but it never holds their keys or their money.
- **The round is bound to the circle.** `roundId` must equal
  `keccak256(abi.encode(circleId, keccak256(abi.encode(legs))))`, so the agent
  cannot invent legs or pull funds outside the circle's deterministic netting
  output.
- **Policy is enforced on-chain.** The contract verifies each standing
  authorization against the exact circle and leg set, enforces the per-round
  debit cap, and rejects expired policies (`validUntil`).
- **Permits still grant allowance.** Standing authorization covers *who may
  settle*; an EIP-2612 permit still grants the token allowance the transfer
  needs. Both are signed once per payer.
- **Mix and match.** Payers without a standing auth can still sign the exact
  per-round `Authorization` — both paths can coexist in one round.

### Running the agent

```bash
cd agent
npm install
node src/index.js          # watches the shared circle store, settles under policy
```

The agent exposes:
- `GET /status` — what it's watching and its last decision
- `GET /log` — the reasoning log (observe / propose / settle / hold)
- `GET /stats` — rounds settled, gross vs net volume
- `POST /demo/run` — scripted agent commerce: four agents deliver services,
  bill each other, sign standing policies, and the agent settles the round
  atomically via `clearWithStanding`
- `POST /policy` — register a participant's signed standing policy + permit

The demo is wired into the site at `/agent` (the "Live demo" panel). The agent
service is a separate process; set `NEXT_PUBLIC_CINCH_AGENT_URL` if it runs on
a different host than the web app. The agent pays gas with its own key
(`CINCH_AGENT_KEY`); generate one and fund it via the Tempo faucet.

### Using the agent (users & external agents)

**Users** grant the agent a standing policy on the `/agent` page: pick a
circle, set a max net debit per round, sign the standing authorization + permit
with your Cinch account or wallet, and the agent can settle that circle for you
without asking again.

**External agents** can register debts through the public API:

```bash
curl -X POST https://cinch-tau.vercel.app/api/agent/bill \
  -H "Content-Type: application/json" \
  -d '{
    "circleId": "your-circle-id",
    "debtor": "0x...",
    "creditor": "0x...",
    "amount": "20.00",
    "reference": "data-feed-invoice-42"
  }'
```

The obligation is appended to the circle in the shared store; the Cinch Agent
then nets and settles it under standing policy. (Demo-grade endpoint — no auth
yet; authenticate agents before production.)

### On-chain verification

`test/clearing.onchain.test.ts` proves the standing path against the deployed
contract on Moderato: two payers sign standing policies, the agent settles a
round with **no per-round authorizations**, balances move exactly, and the
round cannot be replayed. Run it with:

```bash
CINCH_ONCHAIN=1 npx vitest run test/clearing.onchain.test.ts
```

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
