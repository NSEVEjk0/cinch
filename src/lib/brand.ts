/**
 * Brand voice and copy for Cinch — one place for every user-facing word, so the
 * tone stays consistent and precise across the whole product.
 */

export const BRAND = {
  name: "Cinch",
  tagline: "Net it out. Settle the whole circle in one move.",
  oneLiner:
    "Cinch is a multilateral netting clearinghouse on Tempo. When a group owes each other back and forth, it accumulates who owes whom, nets the whole tangle down to the fewest possible transfers, and settles the entire cleared circle in a single atomic transaction — all at once, or not at all.",
  canonicalUrl: "https://cinch.vercel.app",
  xUrl: "https://x.com/CRYPTFRANI",
  repoUrl: "https://github.com/NSEVEjk0/cinch",
} as const;

/** The problem, stated plainly. */
export const PROBLEM = {
  heading: "Circular debt moves far more money than it needs to.",
  body: "When several parties owe each other — a DAO and its contributors, suppliers in a chain, friends after a trip — the obligations loop. A owes B, B owes C, C owes A. Paid one by one, that is a flurry of transfers for almost no change in anyone's real position. Today the only tools that fix it are a bank's internal ledger or a trusted spreadsheet, and someone always has to go first.",
} as const;

/** How Cinch answers it. */
export const HOW = [
  {
    step: "01",
    title: "Open a circle",
    body: "Make a room and add the parties. Drop in each obligation — who owes whom, how much, and what it is for. Share the link so everyone can add theirs.",
  },
  {
    step: "02",
    title: "Net it out",
    body: "Cinch computes everyone's net position and the minimal set of transfers that discharges every debt. A balanced loop collapses to nothing; an unbalanced one shrinks to a handful of payments.",
  },
  {
    step: "03",
    title: "Settle atomically",
    body: "The whole cleared circle goes out as one Tempo transaction. Every leg settles or none does — so no party ever pays into a settlement that leaves someone else short.",
  },
] as const;

/** The standout features — the moat against a lookalike. */
export const FEATURES = [
  {
    title: "One atomic settlement",
    body: "The entire cleared circle is a single Tempo batch. Nobody goes first, nobody is left exposed: the transaction either clears every leg together or does nothing at all. This is the thing a normal payment app cannot do without risky escrow.",
  },
  {
    title: "Liquidity-aware clearing",
    body: "If a party cannot fund their net position on-chain, Cinch does not just fail. It finds the largest sub-circle that everyone present can actually cover and settles that — so one short wallet never blocks the room.",
  },
  {
    title: "Standing circles",
    body: "Keep a circle open. A DAO, a market, or a fleet can accumulate obligations across a week or a month, and Cinch nets and settles on a cadence instead of in a monthly scramble.",
  },
  {
    title: "Multi-stablecoin netting",
    body: "Obligations in different stablecoins net through Tempo's enshrined stablecoin exchange, so a pathUSD debt and an AlphaUSD debt can clear in the same round.",
  },
  {
    title: "Reconciles itself",
    body: "Every settled leg carries the invoice references it discharges in its on-chain memo, so each party's books reconcile straight from Tempo — no separate ledger to keep in sync.",
  },
  {
    title: "Disputes don't block",
    body: "Flag an obligation and Cinch holds it out of the round. One disagreement freezes a single edge, never the whole circle — the rest still clears today.",
  },
  {
    title: "Settlement certificates",
    body: "Every clearing is kept in the circle's history with the terms and the on-chain proof, and exports as a printable certificate — so a settlement is also a record you can file.",
  },
  {
    title: "Agents can clear too",
    body: "The same netting engine answers machines at POST /api/clear: an agent submits obligations and gets back the minimal settlement, so automated systems can net and settle without a browser.",
  },
] as const;

/** Why this is a Tempo project specifically. */
export const WHY_TEMPO = [
  {
    primitive: "Atomic batched transactions",
    use: "The whole cleared circle settles as one transaction — the foundation of trust-free netting.",
  },
  {
    primitive: "transferWithMemo",
    use: "Each leg carries the obligation references it discharges, so settlement is also reconciliation.",
  },
  {
    primitive: "Stablecoin-native fees",
    use: "Fees are paid in the stablecoin being settled — no separate gas token for anyone to hold.",
  },
  {
    primitive: "Fee sponsorship",
    use: "A circle's organiser can sponsor the clearing round, so members settle touching zero gas.",
  },
  {
    primitive: "Enshrined stablecoin DEX",
    use: "Obligations in different stablecoins net against one another inside a single settlement.",
  },
  {
    primitive: "Sub-second finality",
    use: "A cleared circle is final in about half a second, so settling is something you do, not wait for.",
  },
] as const;

export const FAQ = [
  {
    q: "Who holds the money?",
    a: "No one. Cinch never takes custody. It computes the settlement and hands your wallet a single transaction to sign; the money moves party-to-party on Tempo, or not at all.",
  },
  {
    q: "What if the circle doesn't perfectly cancel?",
    a: "It rarely does. Cinch nets to the minimum: the parties who end up net debtors pay only their net position, and net creditors receive only theirs. A loop that nets to zero needs no transfer at all.",
  },
  {
    q: "What stops one person settling and another not?",
    a: "Atomicity. Every leg of the cleared circle is in one Tempo transaction. The chain executes all of them or none — there is no state where some legs land and others don't.",
  },
  {
    q: "What if someone can't pay their share?",
    a: "Liquidity-aware clearing reads each party's on-chain balance and settles the largest sub-circle everyone can actually fund, holding the rest for a later round rather than failing the whole thing.",
  },
  {
    q: "Is anything stored on a server?",
    a: "A circle lives in your browser and is shared by link. The only durable record of a settlement is the Tempo chain itself, which is the point: the ledger is public, verifiable, and nobody's to lose.",
  },
  {
    q: "Does it run on mainnet?",
    a: "Cinch defaults to the Moderato testnet so nothing real moves while you explore. It targets Tempo mainnet by changing one setting.",
  },
] as const;
