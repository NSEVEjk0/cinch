/**
 * Pre-built demo scenarios.
 *
 * These power the interactive demo on the landing page and the "load an
 * example" button in the app, so a first-time visitor sees a tangle of debts
 * collapse into a tiny settlement without typing anything. Each is a real,
 * recognisable situation where multilateral netting is the obvious win.
 */

import type { Obligation } from "./types";
import { PATH_USD } from "./tempo";
import { claimedParty, type Circle } from "./circle";

const addr = (hex: string) => `0x${hex.padStart(40, "0")}` as `0x${string}`;

const usd = (n: number): bigint => BigInt(Math.round(n * 1_000_000));

export interface DemoScenario {
  id: string;
  title: string;
  blurb: string;
  parties: { address: `0x${string}`; name: string }[];
  edges: { from: string; to: string; amount: number; reason: string }[];
}

export const SCENARIOS: DemoScenario[] = [
  {
    id: "contributors",
    title: "A DAO and its contributors",
    blurb:
      "A collective pays five contributors who also invoice each other for sub-work. Gross is large; net is a handful of transfers.",
    parties: [
      { address: addr("da0"), name: "Treasury" },
      { address: addr("a11ce"), name: "Alice" },
      { address: addr("b0b"), name: "Bob" },
      { address: addr("ca401"), name: "Carol" },
      { address: addr("da7e"), name: "Dave" },
    ],
    edges: [
      { from: "Treasury", to: "Alice", amount: 3200, reason: "Oct retainer" },
      { from: "Treasury", to: "Bob", amount: 2800, reason: "Oct retainer" },
      { from: "Treasury", to: "Carol", amount: 2400, reason: "Oct retainer" },
      { from: "Treasury", to: "Dave", amount: 2000, reason: "Oct retainer" },
      { from: "Alice", to: "Bob", amount: 900, reason: "design subcontract" },
      { from: "Bob", to: "Carol", amount: 1100, reason: "backend hours" },
      { from: "Carol", to: "Dave", amount: 600, reason: "QA pass" },
      { from: "Dave", to: "Alice", amount: 750, reason: "copywriting" },
    ],
  },
  {
    id: "trip",
    title: "Four friends after a trip",
    blurb:
      "Everyone covered something — flights, the villa, dinners, the car. Nobody wants six separate Venmo pokes.",
    parties: [
      { address: addr("f1"), name: "Mara" },
      { address: addr("f2"), name: "Jon" },
      { address: addr("f3"), name: "Priya" },
      { address: addr("f4"), name: "Theo" },
    ],
    edges: [
      { from: "Jon", to: "Mara", amount: 420, reason: "villa deposit" },
      { from: "Priya", to: "Mara", amount: 420, reason: "villa deposit" },
      { from: "Theo", to: "Mara", amount: 420, reason: "villa deposit" },
      { from: "Mara", to: "Jon", amount: 310, reason: "flights block" },
      { from: "Priya", to: "Jon", amount: 155, reason: "flights block" },
      { from: "Theo", to: "Priya", amount: 240, reason: "car + fuel" },
      { from: "Mara", to: "Theo", amount: 180, reason: "dinners" },
    ],
  },
  {
    id: "suppliers",
    title: "A supply chain",
    blurb:
      "A manufacturer, two suppliers and a distributor bill each other every month. Netting turns the monthly scramble into one settlement.",
    parties: [
      { address: addr("5109"), name: "Maker Co" },
      { address: addr("5209"), name: "Supplier A" },
      { address: addr("5309"), name: "Supplier B" },
      { address: addr("5409"), name: "Distributor" },
    ],
    edges: [
      { from: "Maker Co", to: "Supplier A", amount: 5400, reason: "components" },
      { from: "Maker Co", to: "Supplier B", amount: 3100, reason: "packaging" },
      { from: "Distributor", to: "Maker Co", amount: 9800, reason: "finished units" },
      { from: "Supplier A", to: "Supplier B", amount: 1200, reason: "shared freight" },
      { from: "Supplier B", to: "Distributor", amount: 700, reason: "returns credit" },
    ],
  },
];

/** Expand a scenario's named edges into real Obligation records. */
export function scenarioObligations(scenario: DemoScenario): Obligation[] {
  const addressOf = (name: string): `0x${string}` => {
    const p = scenario.parties.find((x) => x.name === name);
    if (!p) throw new Error(`Unknown party in scenario: ${name}`);
    return p.address;
  };
  return scenario.edges.map((e, i) => ({
    id: `${scenario.id}-${i + 1}`,
    debtor: addressOf(e.from),
    creditor: addressOf(e.to),
    amount: usd(e.amount),
    token: PATH_USD,
    reference: e.reason,
    createdAt: new Date().toISOString(),
  }));
}

/** Build a ready-to-use Circle from a scenario (for "load an example"). */
export function scenarioToCircle(scenario: DemoScenario, id: string): Circle {
  return {
    id,
    name: scenario.title,
    parties: scenario.parties.map((p) => claimedParty(p.address, p.name)),
    obligations: scenarioObligations(scenario),
    cadence: "once",
    defaultToken: PATH_USD,
    createdAt: new Date().toISOString(),
  };
}
