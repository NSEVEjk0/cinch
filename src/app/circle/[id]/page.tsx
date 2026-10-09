"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { SiteHeader } from "@/components/SiteHeader";
import { CircleDiagram } from "@/components/CircleDiagram";
import { SettlementPanel } from "@/components/SettlementPanel";
import { BackButton } from "@/components/BackButton";
import { TokenSwitch } from "@/components/TokenSwitch";
import {
  loadCircle,
  saveCircle,
  partyName,
  newId,
  type Circle,
  type Party,
  type SettlementRecord,
  recordSettlement,
  rollForward,
  decodeCircle,
  mergeCircle,
  encodeCircle,
  cadenceDue,
} from "@/lib/circle";
import { clearRoom } from "@/lib/netting";
import { openCertificate } from "@/lib/certificate";
import { useNetwork } from "@/lib/useNetwork";
import { parseAmount, formatAmount, formatWithSymbol, formatPercent, isAddress, shortAddress } from "@/lib/money";
import type { Obligation, NettingMode } from "@/lib/types";

export default function CirclePage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);

  const [circle, setCircle] = useState<Circle | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [view, setView] = useState<"gross" | "net">("gross");

  useEffect(() => {
    const c = loadCircle(id);
    // A shared circle arrives as a #c=… fragment; merge it into (or create) the
    // local copy so several people can contribute to the same room by link.
    const frag = typeof window !== "undefined" ? window.location.hash : "";
    const m = frag.match(/[#&]c=([^&]+)/);
    if (m) {
      const incoming = decodeCircle(decodeURIComponent(m[1]));
      if (incoming) {
        const merged = c ? mergeCircle(c, incoming) : incoming;
        saveCircle(merged);
        setCircle(merged);
        // Clean the fragment so a refresh doesn't re-merge.
        if (typeof window !== "undefined") {
          window.history.replaceState(null, "", window.location.pathname);
        }
        return;
      }
    }
    if (!c) setNotFound(true);
    else setCircle(c);
  }, [id]);

  const result = useMemo(
    () => (circle ? clearRoom(circle.obligations, { mode: circle.nettingMode ?? "min-transfers" }) : null),
    [circle]
  );

  function persist(next: Circle) {
    setCircle(next);
    saveCircle(next);
  }

  function changeToken(token: Circle["defaultToken"]) {
    if (!circle) return;
    persist({ ...circle, defaultToken: token });
  }

  function addParty(p: Party) {
    if (!circle) return;
    if (circle.parties.some((x) => x.address.toLowerCase() === p.address.toLowerCase())) return;
    persist({ ...circle, parties: [...circle.parties, p] });
  }

  function addObligation(o: Obligation) {
    if (!circle) return;
    persist({ ...circle, obligations: [...circle.obligations, o] });
  }

  function removeObligation(oid: string) {
    if (!circle) return;
    persist({ ...circle, obligations: circle.obligations.filter((o) => o.id !== oid) });
  }

  function toggleDispute(oid: string, reason?: string) {
    if (!circle) return;
    persist({
      ...circle,
      obligations: circle.obligations.map((o) =>
        o.id === oid
          ? { ...o, disputed: !o.disputed, disputeReason: !o.disputed ? reason : undefined }
          : o
      ),
    });
  }

  function changeMode(mode: NettingMode) {
    if (!circle) return;
    persist({ ...circle, nettingMode: mode });
  }

  function onSettled(record: SettlementRecord) {
    if (!circle) return;
    // Record to history, then roll a standing circle's board forward.
    const withHistory = recordSettlement(circle, record);
    persist(rollForward(withHistory));
  }

  if (notFound) {
    return (
      <>
        <SiteHeader />
        <main className="shell" style={{ paddingTop: 80, minHeight: "60vh" }}>
          <h1 className="display" style={{ fontSize: "2rem", marginBottom: 12 }}>
            That circle isn&apos;t here.
          </h1>
          <p className="muted" style={{ marginBottom: 24 }}>
            Circles live in the browser that made them. This one may be on another device.
          </p>
          <button className="btn btn-primary" onClick={() => router.push("/app")}>
            Back to circles
          </button>
        </main>
      </>
    );
  }

  if (!circle || !result) {
    return (
      <>
        <SiteHeader />
        <main className="shell" style={{ paddingTop: 80, minHeight: "60vh" }}>
          <p className="faint">Loading…</p>
        </main>
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <main className="shell" style={{ paddingTop: 36, paddingBottom: 60 }}>
        {/* header */}
        <div style={{ marginBottom: 20 }}>
          <BackButton fallback="/app" label="Circles" />
        </div>
        <div className="between wrap" style={{ gap: 16, marginBottom: 28 }}>
          <div>
            <div className="row wrap" style={{ gap: 12 }}>
              <h1 className="display" style={{ fontSize: "clamp(1.7rem, 3.4vw, 2.4rem)", margin: 0 }}>
                {circle.name}
              </h1>
              <span className="chip">{circle.cadence === "once" ? "one-off" : circle.cadence}</span>
              {circle.cadence !== "once" ? (
                <span className="chip chip-mint">{cadenceDue(circle)}</span>
              ) : null}
            </div>
          </div>
          <div className="row wrap" style={{ gap: 10 }}>
            <ShareButton circle={circle} />
            <TokenSwitch value={circle.defaultToken} onChange={changeToken} />
          </div>
        </div>

        <SavingsBar circle={circle} />

        <div className="split" style={{ gap: 28, alignItems: "start" }}>
          {/* ------------------------- left: editor ------------------------- */}
          <div className="stack" style={{ gap: 20 }}>
            <AddObligation circle={circle} onAddParty={addParty} onAdd={addObligation} />
            <ObligationList
              circle={circle}
              onRemove={removeObligation}
              onToggleDispute={toggleDispute}
            />
            <AttestPanel circle={circle} onAttest={addParty} />
          </div>

          {/* ------------------------- right: clearing ---------------------- */}
          <div className="stack" style={{ gap: 20 }}>
            {/* diagram */}
            <div className="card card-pad">
              <div className="between" style={{ marginBottom: 10 }}>
                <span className="label">Circle</span>
                <div
                  className="row"
                  style={{
                    gap: 2,
                    padding: 3,
                    borderRadius: 999,
                    border: "1px solid var(--line)",
                    background: "var(--ink-900)",
                  }}
                >
                  <MiniToggle active={view === "gross"} onClick={() => setView("gross")}>
                    Owed
                  </MiniToggle>
                  <MiniToggle active={view === "net"} onClick={() => setView("net")}>
                    Cleared
                  </MiniToggle>
                </div>
              </div>
              {circle.parties.length >= 2 ? (
                <CircleDiagram
                  parties={circle.parties}
                  obligations={circle.obligations.filter((o) => !o.disputed)}
                  transfers={result.transfers}
                  mode={view}
                  size={400}
                />
              ) : (
                <p className="faint" style={{ textAlign: "center", padding: "60px 0" }}>
                  Add at least two parties and an obligation to see the circle.
                </p>
              )}
            </div>

            <ModeToggle mode={circle.nettingMode ?? "min-transfers"} onChange={changeMode} />

            {/* settlement */}
            <SettlementPanel circle={circle} result={result} onSettled={onSettled} />

            <SettlementHistory circle={circle} />
          </div>
        </div>
      </main>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Add-obligation form                                                        */
/* -------------------------------------------------------------------------- */

function AddObligation({
  circle,
  onAddParty,
  onAdd,
}: {
  circle: Circle;
  onAddParty: (p: Party) => void;
  onAdd: (o: Obligation) => void;
}) {
  const [debtor, setDebtor] = useState("");
  const [creditor, setCreditor] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  const token = circle.defaultToken;

  function resolveParty(input: string): { address: `0x${string}`; name: string } | null {
    const trimmed = input.trim();
    // Match an existing party by name first.
    const byName = circle.parties.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
    if (byName) return byName;
    if (isAddress(trimmed)) return { address: trimmed, name: shortAddress(trimmed) };
    return null;
  }

  function submit() {
    setError(null);
    const d = resolveParty(debtor);
    const c = resolveParty(creditor);
    if (!d) return setError("The payer must be a known party name or a 0x address.");
    if (!c) return setError("The payee must be a known party name or a 0x address.");
    if (d.address.toLowerCase() === c.address.toLowerCase())
      return setError("A party cannot owe themselves.");
    let units: bigint;
    try {
      units = parseAmount(amount, token.decimals);
    } catch {
      return setError("Enter a valid amount.");
    }
    if (units <= 0n) return setError("The amount must be above zero.");

    onAddParty(d);
    onAddParty(c);
    onAdd({
      id: newId("o"),
      debtor: d.address,
      creditor: c.address,
      amount: units,
      token,
      reference: reference.trim() || "obligation",
      createdAt: new Date().toISOString(),
    });
    setDebtor("");
    setCreditor("");
    setAmount("");
    setReference("");
  }

  return (
    <div className="card card-pad">
      <h2 className="display" style={{ fontSize: "1.2rem", marginBottom: 16 }}>
        Add an obligation
      </h2>
      <div className="g2" style={{ gap: 12 }}>
        <label className="stack">
          <span className="label">Payer owes…</span>
          <input
            className="field"
            placeholder="Alice or 0x…"
            value={debtor}
            onChange={(e) => setDebtor(e.target.value)}
            list="party-list"
          />
        </label>
        <label className="stack">
          <span className="label">…payee</span>
          <input
            className="field"
            placeholder="Bob or 0x…"
            value={creditor}
            onChange={(e) => setCreditor(e.target.value)}
            list="party-list"
          />
        </label>
      </div>
      <datalist id="party-list">
        {circle.parties.map((p) => (
          <option key={p.address} value={p.name} />
        ))}
      </datalist>
      <div className="g2" style={{ gap: 12, marginTop: 12 }}>
        <label className="stack">
          <span className="label">Amount ({token.symbol})</span>
          <input
            className="field mono"
            placeholder="100.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="stack">
          <span className="label">For (reference)</span>
          <input
            className="field"
            placeholder="invoice #42"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </label>
      </div>
      {error ? <p style={{ color: "var(--rose-400)", marginTop: 12, fontSize: "0.9rem" }}>{error}</p> : null}
      <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={submit}>
        Add to circle
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Obligation list                                                            */
/* -------------------------------------------------------------------------- */

function ObligationList({
  circle,
  onRemove,
  onToggleDispute,
}: {
  circle: Circle;
  onRemove: (id: string) => void;
  onToggleDispute: (id: string, reason?: string) => void;
}) {
  if (circle.obligations.length === 0) {
    return (
      <div className="card card-pad">
        <p className="faint" style={{ margin: 0, textAlign: "center", padding: "24px 0" }}>
          No obligations yet. Add who owes whom above.
        </p>
      </div>
    );
  }
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="card-pad" style={{ padding: "16px 22px", borderBottom: "1px solid var(--line)" }}>
        <span className="label">Obligations · {circle.obligations.length}</span>
      </div>
      <div>
        {circle.obligations.map((o) => (
          <div
            key={o.id}
            className="between"
            style={{
              padding: "14px 22px",
              borderBottom: "1px solid var(--line)",
              opacity: o.disputed ? 0.5 : 1,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.95rem" }}>
                  {partyNameShort(circle, o.debtor)}
                  <span className="faint" style={{ margin: "0 7px" }}>→</span>
                  {partyNameShort(circle, o.creditor)}
                </span>
                {o.disputed ? <span className="chip" style={{ color: "var(--amber-400)" }}>disputed</span> : null}
              </div>
              <div className="faint" style={{ fontSize: "0.8rem", marginTop: 3 }}>
                {o.reference}
                {o.disputed && o.disputeReason ? (
                  <span style={{ color: "var(--amber-400)" }}> · {o.disputeReason}</span>
                ) : null}
              </div>
            </div>
            <div className="row" style={{ gap: 14 }}>
              <span className="mono tnum" style={{ fontSize: "0.95rem" }}>
                {formatWithSymbol(o.amount, o.token)}
              </span>
              <button
                className="btn btn-quiet btn-sm"
                style={{ padding: "4px 8px", color: o.disputed ? "var(--mint-400)" : "var(--amber-400)" }}
                onClick={() => {
                  if (o.disputed) {
                    onToggleDispute(o.id);
                  } else {
                    const reason = window.prompt("Why is this disputed? (optional)") ?? "";
                    onToggleDispute(o.id, reason.trim() || undefined);
                  }
                }}
                title={o.disputed ? "Include in the round" : "Hold out of the round"}
              >
                {o.disputed ? "restore" : "dispute"}
              </button>
              <button
                className="btn btn-quiet btn-sm"
                style={{ padding: "4px 8px", color: "var(--text-faint)" }}
                onClick={() => onRemove(o.id)}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function partyNameShort(circle: Circle, address: string): string {
  const name = partyName(circle, address);
  return name.startsWith("0x") ? shortAddress(name) : name;
}

function ShareButton({ circle }: { circle: Circle }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    if (typeof window === "undefined") return;
    // Pack the circle's state into the link so whoever opens it joins the same
    // room and can add their own obligations — no server involved.
    const encoded = encodeCircle(circle);
    const url = `${window.location.origin}${window.location.pathname}#c=${encodeURIComponent(encoded)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <button className="btn btn-ghost btn-sm" onClick={share} title="Copy a shareable link that carries this circle">
      {copied ? "Link copied ✓" : "Share circle"}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Savings bar — the running "value saved" headline                           */
/* -------------------------------------------------------------------------- */

function SavingsBar({ circle }: { circle: Circle }) {
  const settlements = circle.settlements ?? [];
  if (settlements.length === 0) return null;

  // Sum gross vs netted across every past clearing, scaled by decimals (6).
  let gross = 0;
  let netted = 0;
  let transfers = 0;
  for (const s of settlements) {
    for (const v of Object.values(s.grossByToken)) gross += Number(BigInt(v)) / 1e6;
    for (const v of Object.values(s.nettedByToken)) netted += Number(BigInt(v)) / 1e6;
    transfers += s.transfers.length;
  }
  const saved = gross - netted;
  const pct = gross > 0 ? Math.round((saved / gross) * 100) : 0;
  const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  return (
    <div
      className="card card-pad glow-ring"
      style={{ padding: 20, marginBottom: 24, background: "radial-gradient(500px 200px at 20% 0%, var(--mint-glow), transparent 70%)" }}
    >
      <span className="label">Value saved by netting</span>
      <p className="muted" style={{ margin: "8px 0 0", fontSize: "1.02rem", lineHeight: 1.5 }}>
        Across {settlements.length} clearing{settlements.length === 1 ? "" : "s"}, Cinch moved{" "}
        <strong className="mono" style={{ color: "var(--text)" }}>{money(netted)}</strong> instead of{" "}
        <strong className="mono" style={{ color: "var(--text)" }}>{money(gross)}</strong> —{" "}
        <strong style={{ color: "var(--mint-400)" }}>{pct}% less</strong>, in{" "}
        {transfers} transfer{transfers === 1 ? "" : "s"}.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Netting-mode toggle                                                        */
/* -------------------------------------------------------------------------- */

function ModeToggle({ mode, onChange }: { mode: NettingMode; onChange: (m: NettingMode) => void }) {
  return (
    <div className="card card-pad" style={{ padding: 18 }}>
      <div className="between wrap" style={{ gap: 10 }}>
        <div>
          <span className="label">Clearing mode</span>
          <p className="faint" style={{ margin: "6px 0 0", fontSize: "0.82rem", maxWidth: "40ch" }}>
            {mode === "min-transfers"
              ? "Fewest transfers — a debt may be settled through a third party."
              : "Preserve relationships — a debt is only ever settled by its own two parties."}
          </p>
        </div>
        <div className="segment">
          <button data-active={mode === "min-transfers"} onClick={() => onChange("min-transfers")}>
            Fewest
          </button>
          <button
            data-active={mode === "preserve-relationships"}
            onClick={() => onChange("preserve-relationships")}
          >
            Bilateral
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Attest panel — connect wallet to confirm you're a party                    */
/* -------------------------------------------------------------------------- */

function AttestPanel({ circle, onAttest }: { circle: Circle; onAttest: (p: Party) => void }) {
  const { address, isConnected } = useAccount();
  if (!isConnected || !address) return null;

  const me = circle.parties.find((p) => p.address.toLowerCase() === address.toLowerCase());
  if (!me) return null; // the connected wallet isn't a listed party

  if (me.attestedAt) {
    return (
      <div className="card card-pad" style={{ padding: 16 }}>
        <span className="mono" style={{ fontSize: "0.84rem", color: "var(--mint-400)" }}>
          ✓ You ({me.name}) have confirmed the obligations involving you.
        </span>
      </div>
    );
  }
  return (
    <div className="card card-pad" style={{ padding: 16 }}>
      <p className="muted" style={{ margin: "0 0 12px", fontSize: "0.9rem" }}>
        You&apos;re listed as <strong>{me.name}</strong> in this circle. Confirm the obligations
        involving you so everyone knows the room is agreed before it clears.
      </p>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => onAttest({ ...me, attestedAt: new Date().toISOString() })}
      >
        Confirm my obligations
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Settlement history + certificates                                          */
/* -------------------------------------------------------------------------- */

function SettlementHistory({ circle }: { circle: Circle }) {
  const network = useNetwork();
  const settlements = [...(circle.settlements ?? [])].reverse();
  if (settlements.length === 0) return null;

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="card-pad" style={{ padding: "16px 22px", borderBottom: "1px solid var(--line)" }}>
        <span className="label">Settlement history · {settlements.length}</span>
      </div>
      <div>
        {settlements.map((s) => (
          <div key={s.id} className="between" style={{ padding: "14px 22px", borderBottom: "1px solid var(--line)" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "0.92rem" }}>
                {new Date(s.at).toLocaleDateString()} ·{" "}
                <span className="faint">{s.transfers.length} transfer{s.transfers.length === 1 ? "" : "s"}</span>
              </div>
              <div className="faint mono" style={{ fontSize: "0.76rem", marginTop: 3 }}>
                {Math.round(s.compressionRatio * 100)}% compressed · {s.atomic ? "atomic" : "leg-by-leg"}
              </div>
            </div>
            <button
              className="btn btn-quiet btn-sm"
              style={{ color: "var(--mint-400)" }}
              onClick={() => openCertificate(circle, s, network)}
            >
              Certificate →
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="mono"
      style={{
        border: 0,
        cursor: "pointer",
        fontSize: "0.72rem",
        padding: "5px 12px",
        borderRadius: 999,
        background: active ? "linear-gradient(180deg, var(--mint-400), var(--mint-500))" : "transparent",
        color: active ? "var(--accent-ink)" : "var(--text-soft)",
        fontWeight: active ? 600 : 500,
      }}
    >
      {children}
    </button>
  );
}
