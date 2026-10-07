"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { CircleDiagram } from "@/components/CircleDiagram";
import { SettlementPanel } from "@/components/SettlementPanel";
import {
  loadCircle,
  saveCircle,
  partyName,
  newId,
  type Circle,
  type Party,
} from "@/lib/circle";
import { clearRoom } from "@/lib/netting";
import { parseAmount, formatAmount, formatWithSymbol, formatPercent, isAddress, shortAddress } from "@/lib/money";
import type { Obligation } from "@/lib/types";

export default function CirclePage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);

  const [circle, setCircle] = useState<Circle | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [view, setView] = useState<"gross" | "net">("gross");

  useEffect(() => {
    const c = loadCircle(id);
    if (!c) setNotFound(true);
    else setCircle(c);
  }, [id]);

  const result = useMemo(
    () => (circle ? clearRoom(circle.obligations) : null),
    [circle]
  );

  function persist(next: Circle) {
    setCircle(next);
    saveCircle(next);
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

  function toggleDispute(oid: string) {
    if (!circle) return;
    persist({
      ...circle,
      obligations: circle.obligations.map((o) =>
        o.id === oid ? { ...o, disputed: !o.disputed } : o
      ),
    });
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

  const token = circle.defaultToken;

  return (
    <>
      <SiteHeader />
      <main className="shell" style={{ paddingTop: 36, paddingBottom: 60 }}>
        {/* header */}
        <div className="between wrap" style={{ gap: 16, marginBottom: 28 }}>
          <div>
            <button
              className="btn btn-quiet btn-sm"
              style={{ padding: 0, marginBottom: 8 }}
              onClick={() => router.push("/app")}
            >
              ← Circles
            </button>
            <div className="row" style={{ gap: 12 }}>
              <h1 className="display" style={{ fontSize: "clamp(1.7rem, 3.4vw, 2.4rem)", margin: 0 }}>
                {circle.name}
              </h1>
              <span className="chip">{circle.cadence === "once" ? "one-off" : circle.cadence}</span>
            </div>
          </div>
          <div className="chip chip-mint">
            <span className="dot" /> {token.symbol}
          </div>
        </div>

        <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 28 }}>
          {/* ------------------------- left: editor ------------------------- */}
          <div className="stack" style={{ gap: 20 }}>
            <AddObligation circle={circle} onAddParty={addParty} onAdd={addObligation} />
            <ObligationList
              circle={circle}
              onRemove={removeObligation}
              onToggleDispute={toggleDispute}
            />
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

            {/* settlement */}
            <SettlementPanel circle={circle} result={result} onCleared={(at) => persist({ ...circle, lastClearedAt: at })} />
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
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
      <div className="grid" style={{ gridTemplateColumns: "1fr 1.4fr", gap: 12, marginTop: 12 }}>
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
  onToggleDispute: (id: string) => void;
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
              </div>
            </div>
            <div className="row" style={{ gap: 14 }}>
              <span className="mono tnum" style={{ fontSize: "0.95rem" }}>
                {formatWithSymbol(o.amount, o.token)}
              </span>
              <button
                className="btn btn-quiet btn-sm"
                style={{ padding: "4px 8px", color: o.disputed ? "var(--mint-400)" : "var(--amber-400)" }}
                onClick={() => onToggleDispute(o.id)}
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
        color: active ? "#04120d" : "var(--text-soft)",
        fontWeight: active ? 600 : 500,
      }}
    >
      {children}
    </button>
  );
}
