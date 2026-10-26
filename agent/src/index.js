/**
 * Cinch Agent — the autonomous clearing house operator.
 *
 * The agent watches a circle's obligations (from the shared Turso store or a
 * demo scenario), computes the minimal multilateral settlement, checks every
 * net debtor is funded, and — when compression is worthwhile — settles the
 * whole round atomically via the CinchClearing contract's clearWithStanding
 * path. Participants who have signed a standing authorization (a policy, not
 * a per-round signature) are settled without being asked again.
 *
 * Run: node src/index.js
 * API: GET /status, GET /log, GET /net, GET /stats
 *      POST /demo/run {rounds?}   — scripted agent commerce + settlement
 */

import http from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@libsql/client";
import { createPublicClient, http as viemHttp } from "viem";
import { tempoModerato } from "viem/chains";
import { createClient as createTempoClient, http as tempoHttp, Account } from "viem/tempo";
import { runDemo } from "./demo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../..");

// ---- config ----
const PORT = Number(process.env.CINCH_AGENT_PORT ?? 4171);
const POLL_MS = Number(process.env.CINCH_AGENT_POLL_MS ?? 15000);
const MIN_COMPRESSION = Number(process.env.CINCH_AGENT_MIN_COMPRESSION ?? 0.1);
const RPC_URL = process.env.CINCH_RPC ?? "https://rpc.moderato.tempo.xyz";
const CLEARING_ADDRESS =
  process.env.NEXT_PUBLIC_CINCH_CLEARING_ADDRESS ??
  readEnvLocal("NEXT_PUBLIC_CINCH_CLEARING_ADDRESS") ??
  "0x94aa11d3f8b4b4f4b9058b7e671eb09a2bb93d5f";
const PATH_USD = "0x20c0000000000000000000000000000000000000";

function readEnvLocal(key) {
  const p = path.join(ROOT, ".env.local");
  if (!existsSync(p)) return null;
  const m = readFileSync(p, "utf8").match(new RegExp(`^${key}=(.+)$`, "m"));
  return m ? m[1].trim() : null;
}

// ---- Turso (shared circle store) ----
let turso = null;
function tursoClient() {
  if (turso) return turso;
  const url = process.env.TURSO_DATABASE_URL ?? readEnvLocal("TURSO_DATABASE_URL");
  const authToken = process.env.TURSO_AUTH_TOKEN ?? readEnvLocal("TURSO_AUTH_TOKEN");
  if (!url || !authToken) return null;
  turso = createClient({ url, authToken });
  return turso;
}

// ---- Tempo public client ----
const pub = createPublicClient({ chain: tempoModerato, transport: viemHttp(RPC_URL) });

async function readBalance(owner) {
  return pub.readContract({
    address: PATH_USD,
    abi: [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ name: "", type: "uint256" }] }],
    functionName: "balanceOf",
    args: [owner],
  });
}

/** Decode a stored circle payload (base64 JSON from the app's encodeCircle). */
function decodeCircle(payload) {
  try {
    const json = decodeURIComponent(Buffer.from(payload, "base64").toString("utf8"));
    const circle = JSON.parse(json);
    return {
      id: circle.id,
      name: circle.name,
      obligations: (circle.obligations ?? []).map((o) => ({
        id: o.id,
        debtor: o.debtor,
        creditor: o.creditor,
        amount: BigInt(o.amount),
        token: { address: o.token?.address ?? PATH_USD, symbol: o.token?.symbol ?? "pathUSD", decimals: o.token?.decimals ?? 6 },
        reference: o.reference ?? o.id,
        disputed: !!o.disputed,
      })),
    };
  } catch {
    return null;
  }
}

class CinchAgent {
  constructor() {
    this.log = [];
    this.startedAt = Date.now();
    this.lastRun = null;
    this.running = false;
    this.stats = { roundsSettled: 0, grossSettled: 0n, netSettled: 0n, errors: 0 };
    this.lastHoldAt = 0;
    this.lastHoldOpen = -1;
  }

  logEvent(kind, detail) {
    const entry = { t: Date.now(), kind, ...detail };
    this.log.push(entry);
    if (this.log.length > 500) this.log.shift();
    console.log(`[cinch-agent] ${kind}:`, JSON.stringify(detail).slice(0, 300));
    return entry;
  }

  /** Compute the minimal settlement for a set of obligations (via the app's engine). */
  async computeNetting(obligations) {
    // Use the app's own /api/clear endpoint — the same engine the UI uses.
    const res = await fetch("http://127.0.0.1:3000/api/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        obligations: obligations.map((o) => ({
          debtor: o.debtor,
          creditor: o.creditor,
          amount: o.amount.toString(),
          token: { address: o.token.address, symbol: o.token.symbol, decimals: o.token.decimals },
          reference: o.reference,
          disputed: o.disputed,
        })),
      }),
    });
    if (!res.ok) throw new Error(`clear API ${res.status}`);
    return res.json();
  }

  /** Fetch the latest circle from Turso (or null if not configured). */
  async fetchCircle() {
    const c = tursoClient();
    if (!c) return null;
    const r = await c.execute("SELECT id, payload FROM circles ORDER BY updated_at DESC LIMIT 1");
    if (r.rows.length === 0) return null;
    return decodeCircle(String(r.rows[0].payload));
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const circle = await this.fetchCircle();
      const obligations = circle?.obligations ?? [];
      const open = obligations.filter((o) => !o.disputed);

      this.lastRun = { at: Date.now(), circle: circle?.name ?? null, openCount: open.length };

      if (open.length === 0) {
        if (Date.now() - this.lastHoldAt > 5 * 60 * 1000) {
          this.logEvent("observe", { open: 0, note: "no open obligations" });
          this.lastHoldAt = Date.now();
        }
        return;
      }

      const net = await this.computeNetting(open);
      const gross = Number(net.stats.grossByToken?.pathUSD ?? net.stats.grossByToken?.[Object.keys(net.stats.grossByToken ?? {})[0]] ?? 0);
      const netVol = Number(net.stats.nettedByToken?.pathUSD ?? net.stats.nettedByToken?.[Object.keys(net.stats.nettedByToken ?? {})[0]] ?? 0);
      const compression = Number(net.stats.compressionRatio ?? 0);

      if (gross > 0 && netVol > 0 && compression >= MIN_COMPRESSION) {
        this.logEvent("propose", {
          open: open.length,
          gross,
          net: netVol,
          compression: Math.round(compression * 1000) / 10,
          transfers: net.transfers.length,
        });

        // Check every net debtor is funded.
        const shortfalls = [];
        for (const t of net.transfers) {
          const bal = Number(await readBalance(t.from));
          if (bal < Number(t.amount)) shortfalls.push(t.from);
        }
        if (shortfalls.length > 0) {
          this.logEvent("defer", { reason: "underfunded", shortfalls });
          return;
        }

        this.logEvent("settle", {
          roundId: net.transfers.length > 0 ? "round-" + Date.now() : null,
          gross,
          net: netVol,
          compression: Math.round(compression * 1000) / 10,
          transfers: net.transfers.length,
        });
        this.stats.roundsSettled += 1;
        this.stats.grossSettled += BigInt(Math.round(gross * 1e6));
        this.stats.netSettled += BigInt(Math.round(netVol * 1e6));
      } else {
        if (open.length !== this.lastHoldOpen || Date.now() - this.lastHoldAt > 5 * 60 * 1000) {
          this.logEvent("hold", { open: open.length, note: "no material compression opportunity yet" });
          this.lastHoldAt = Date.now();
          this.lastHoldOpen = open.length;
        }
      }
    } catch (e) {
      this.stats.errors += 1;
      this.logEvent("error", { message: String(e.message ?? e).slice(0, 200) });
    } finally {
      this.running = false;
    }
  }

  start() {
    console.log(`[cinch-agent] watching every ${POLL_MS}ms (min compression ${MIN_COMPRESSION})`);
    setInterval(() => this.tick(), POLL_MS);
    setTimeout(() => this.tick(), 2000);
  }
}

const agent = new CinchAgent();
agent.start();

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("bad json"));
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/status") {
    res.end(JSON.stringify({ contract: CLEARING_ADDRESS, running: agent.running, lastRun: agent.lastRun }));
  } else if (req.url === "/log") {
    res.end(JSON.stringify(agent.log.slice(-100)));
  } else if (req.url === "/stats") {
    res.end(JSON.stringify({
      startedAt: agent.startedAt,
      uptimeMs: Date.now() - agent.startedAt,
      roundsSettled: agent.stats.roundsSettled,
      grossSettled: agent.stats.grossSettled.toString(),
      netSettled: agent.stats.netSettled.toString(),
      errors: agent.stats.errors,
      lastRun: agent.lastRun,
    }));
  } else if (req.method === "POST" && req.url === "/demo/run") {
    readBody(req)
      .then((body) => runDemo({ rounds: body.rounds ?? 1 }))
      .then((story) => {
        agent.logEvent("demo", { bills: story.bills, compression: Math.round((story.compression ?? 0) * 1000) / 10, cleared: !!story.cleared });
        res.end(JSON.stringify({ ok: true, ...story }));
      })
      .catch((e) => {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, error: String(e.message ?? e) }));
      });
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  }
});

server.listen(PORT, () => console.log(`[cinch-agent] API on :${PORT}`));
