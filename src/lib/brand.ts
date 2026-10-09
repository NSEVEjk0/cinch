/**
 * Brand voice and copy for Cinch — one place for every user-facing word, so the
 * tone stays consistent and precise across the whole product.
 */

export const BRAND = {
  name: "Cinch",
  tagline: "Net it out. Settle the whole circle in one move.",
  oneLiner:
    "Cinch is a multilateral netting clearinghouse on Tempo. When a group owes each other back and forth, it accumulates who owes whom, nets the whole tangle down to the fewest possible transfers, and settles the entire cleared circle in a single atomic transaction — all at once, or not at all.",
  canonicalUrl: "https://cinch-tau.vercel.app",
  xUrl: "https://x.com/CRYPTFRANI",
  repoUrl: "https://github.com/NSEVEjk0/cinch",
} as const;

/** The problem, stated plainly. */
export const PROBLEM = {
  heading: "Circular debt moves far more money than it needs to.",
  body: "When several parties owe each other — a DAO and its contributors, suppliers in a chain, friends after a trip — the obligations loop. A owes B, B owes C, C owes A. Paid one by one, that is a flurry of transfers for almost no change in anyone's real position. Today the only tools that fix it are a bank's internal ledger or a trusted spreadsheet, and someone always has to go first.",
} as const;

/** The solution, stated just as plainly. */
export const SOLUTION = {
  heading: "Net the whole circle, then settle it in one move.",
  body: "Cinch is a multilateral clearinghouse. It gathers every obligation in a group, cancels the debts that loop, and reduces the rest to the fewest transfers anyone has to make — then settles that entire cleared circle as a single atomic transaction on Tempo. No one goes first. No one is left short. Here is how it works.",
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
    title: "Invoices, not just IOUs",
    body: "Give an obligation a due date and an early-pay discount, and the discount applies automatically when a standing circle clears inside the window. Overdue items are flagged; the terms travel into the settlement.",
  },
  {
    title: "Splits and payroll in one move",
    body: "Compile a Splitwise-style shared expense or a one-to-many payroll run straight into a circle. A payroll run settles as a single sponsored atomic transaction, so recipients are paid together and touch zero gas.",
  },
  {
    title: "Clear by API too",
    body: "The same netting engine answers programs at POST /api/clear: submit obligations and get back the minimal settlement, so backends and automated systems can net and settle without a browser.",
  },
] as const;

/** Where Cinch clears — the market, made concrete for anyone sizing it up. */
export const USE_CASES = [
  {
    title: "DAOs & contributor payouts",
    body: "Grants, bounties, and reimbursements loop between a treasury and its contributors all month. A standing circle nets them into one clearing instead of a hundred separate transfers.",
  },
  {
    title: "Marketplaces & platforms",
    body: "Platform fees run one way, seller payouts the other. Cinch nets them so money moves once at its true net, not gross in both directions.",
  },
  {
    title: "Supplier & vendor chains",
    body: "Businesses that both buy from and sell to each other carry offsetting invoices. Clear the net balance in a single settlement rather than paying every invoice gross.",
  },
  {
    title: "Payroll & teams",
    body: "A one-to-many run compiles straight into a circle and settles as a single sponsored atomic transaction — everyone paid together, touching zero gas.",
  },
  {
    title: "Funds & back offices",
    body: "Inter-entity obligations net on a cadence and settle with an on-chain certificate attached, so the books reconcile straight from Tempo.",
  },
  {
    title: "Groups & trips",
    body: "The shared-expense case, finally finished: one netted settlement instead of a chain of IOUs and someone fronting the difference.",
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
    primitive: "Time-locked execution (validAfter)",
    use: "A circle can be signed now and clear itself later — scheduled netting without anyone back to press the button.",
  },
  {
    primitive: "Sub-second finality",
    use: "A cleared circle is final in about half a second, so settling is something you do, not wait for.",
  },
] as const;

export const FAQ = [
  {
    q: "Who holds the money?",
    a: "No one. Cinch never takes custody. It computes the settlement and your self-custodial Cinch account signs a single transaction; the money moves party-to-party on Tempo, or not at all.",
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
    a: "No. A circle lives in your browser and is shared by link, and your account is a self-custodial key you recover from a phrase — never held on a server. The only durable record of a settlement is the Tempo chain itself: public, verifiable, and nobody's to lose.",
  },
  {
    q: "Does it run on mainnet?",
    a: "Cinch defaults to the Moderato testnet so nothing real moves while you explore. It targets Tempo mainnet by changing one setting.",
  },
] as const;
