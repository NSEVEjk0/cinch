"use client";

/**
 * CreateTemplates — compile real situations into a circle.
 *
 * Two starting points beyond a blank room:
 *  - Split an expense (Splitwise-style): one payer, a group, split equally.
 *  - Payroll run: one funder paying many recipients, settled as one sponsored
 *    atomic batch.
 * Both produce a normal Circle you can keep editing before you clear it.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveCircle } from "@/lib/circle";
import { buildSplitCircle, buildPayrollCircle, type PayrollLine } from "@/lib/templates";
import { parseAmount } from "@/lib/money";
import { useNetwork } from "@/lib/useNetwork";

export function CreateTemplates() {
  const [open, setOpen] = useState<"split" | "payroll" | null>(null);
  return (
    <div style={{ marginTop: 22 }}>
      <div className="g2" style={{ gap: 12 }}>
        <TemplateTile
          title="Split an expense"
          blurb="One person paid for the group. Split it equally — several splits in one circle net against each other."
          cta="Split a bill →"
          onClick={() => setOpen("split")}
        />
        <TemplateTile
          title="Payroll run"
          blurb="One funder pays many recipients. Settles as a single sponsored atomic transaction — recipients touch zero gas."
          cta="Start a payroll run →"
          onClick={() => setOpen("payroll")}
        />
      </div>
      {open === "split" ? <SplitModal onClose={() => setOpen(null)} /> : null}
      {open === "payroll" ? <PayrollModal onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function TemplateTile({ title, blurb, cta, onClick }: { title: string; blurb: string; cta: string; onClick: () => void }) {
  return (
    <button
      className="feature-card"
      onClick={onClick}
      style={{ textAlign: "left", cursor: "pointer", display: "block", width: "100%" }}
    >
      <h3 className="display" style={{ fontSize: "1.12rem", marginBottom: 8, letterSpacing: "-0.02em" }}>{title}</h3>
      <p className="muted" style={{ fontSize: "0.88rem", lineHeight: 1.55, margin: "0 0 12px" }}>{blurb}</p>
      <span className="mono" style={{ color: "var(--accent)", fontSize: "0.82rem" }}>{cta}</span>
    </button>
  );
}

function SplitModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const token = useNetwork().tokens[0];
  const [name, setName] = useState("");
  const [payer, setPayer] = useState("");
  const [members, setMembers] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function create() {
    setError(null);
    const payerName = payer.trim();
    const memberList = members.split(/[,\n]/).map((m) => m.trim()).filter(Boolean);
    if (!payerName) return setError("Who paid?");
    if (memberList.length === 0) return setError("List the people to split between.");
    let units: bigint;
    try {
      units = parseAmount(amount, token.decimals);
    } catch {
      return setError("Enter a valid amount.");
    }
    if (units <= 0n) return setError("The amount must be above zero.");
    const all = Array.from(new Set([payerName, ...memberList]));
    const circle = buildSplitCircle({
      circleName: name,
      payer: payerName,
      members: all,
      amount: units,
      reason,
      token,
    });
    saveCircle(circle);
    router.push(`/circle/${circle.id}`);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Split an expense" style={{ maxWidth: 440 }}>
        <div className="between" style={{ marginBottom: 10 }}>
          <h2 className="display" style={{ fontSize: "1.3rem", margin: 0 }}>Split an expense</h2>
          <button className="btn btn-quiet btn-sm" style={{ padding: 6 }} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="stack" style={{ gap: 12 }}>
          <label className="stack">
            <span className="label">Circle name</span>
            <input className="field" placeholder="Lisbon trip" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="stack">
            <span className="label">Who paid</span>
            <input className="field" placeholder="Mara" value={payer} onChange={(e) => setPayer(e.target.value)} />
          </label>
          <label className="stack">
            <span className="label">Split between (names or 0x…, comma-separated — include the payer)</span>
            <textarea
              className="field"
              style={{ minHeight: 64, resize: "vertical" }}
              placeholder="Mara, Jon, Priya, Theo"
              value={members}
              onChange={(e) => setMembers(e.target.value)}
            />
          </label>
          <div className="g2" style={{ gap: 12 }}>
            <label className="stack">
              <span className="label">Amount ({token.symbol})</span>
              <input className="field mono" placeholder="320.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="stack">
              <span className="label">For</span>
              <input className="field" placeholder="villa deposit" value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
          </div>
          {error ? <p style={{ color: "var(--neg)", fontSize: "0.85rem", margin: 0 }}>{error}</p> : null}
          <button className="btn btn-primary" onClick={create}>Create split circle →</button>
          <p className="faint" style={{ fontSize: "0.78rem", margin: 0 }}>
            Each person owes the payer an equal share. Add more expenses inside the circle and they
            all net together before you settle.
          </p>
        </div>
      </div>
    </div>
  );
}

function PayrollModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const token = useNetwork().tokens[0];
  const [name, setName] = useState("");
  const [funder, setFunder] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState("");
  const [cadence, setCadence] = useState<"once" | "weekly" | "monthly">("monthly");
  const [error, setError] = useState<string | null>(null);

  function create() {
    setError(null);
    if (!funder.trim()) return setError("Who funds the run?");
    const parsed: PayrollLine[] = [];
    for (const raw of lines.split(/\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const [recipient, amt] = line.split(/[,\t]/).map((s) => s.trim());
      if (!recipient || !amt) return setError(`Each line is "name, amount" — check: ${line}`);
      let units: bigint;
      try {
        units = parseAmount(amt, token.decimals);
      } catch {
        return setError(`"${amt}" is not a valid amount.`);
      }
      if (units <= 0n) return setError(`Amount must be above zero for ${recipient}.`);
      parsed.push({ recipient, amount: units });
    }
    if (parsed.length === 0) return setError("Add at least one recipient line.");
    const circle = buildPayrollCircle({
      circleName: name,
      funder: funder.trim(),
      lines: parsed,
      reference,
      token,
      cadence,
    });
    saveCircle(circle);
    router.push(`/circle/${circle.id}`);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Payroll run" style={{ maxWidth: 460 }}>
        <div className="between" style={{ marginBottom: 10 }}>
          <h2 className="display" style={{ fontSize: "1.3rem", margin: 0 }}>Payroll run</h2>
          <button className="btn btn-quiet btn-sm" style={{ padding: 6 }} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="stack" style={{ gap: 12 }}>
          <label className="stack">
            <span className="label">Circle name</span>
            <input className="field" placeholder="October payroll" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="stack">
            <span className="label">Funder (name or 0x…)</span>
            <input className="field" placeholder="Treasury" value={funder} onChange={(e) => setFunder(e.target.value)} />
          </label>
          <label className="stack">
            <span className="label">Recipients — one per line: name, amount</span>
            <textarea
              className="field mono"
              style={{ minHeight: 110, resize: "vertical" }}
              placeholder={"Alice, 3200\nBob, 2800\nCarol, 2400"}
              value={lines}
              onChange={(e) => setLines(e.target.value)}
            />
          </label>
          <div className="g2" style={{ gap: 12 }}>
            <label className="stack">
              <span className="label">Reference</span>
              <input className="field" placeholder="Oct salary" value={reference} onChange={(e) => setReference(e.target.value)} />
            </label>
            <div className="stack">
              <span className="label">Cadence</span>
              <div className="segment" style={{ marginTop: 6 }}>
                {(["once", "weekly", "monthly"] as const).map((c) => (
                  <button key={c} data-active={cadence === c} onClick={() => setCadence(c)}>
                    {c === "once" ? "One-off" : c}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {error ? <p style={{ color: "var(--neg)", fontSize: "0.85rem", margin: 0 }}>{error}</p> : null}
          <button className="btn btn-primary" onClick={create}>Create payroll run →</button>
          <p className="faint" style={{ fontSize: "0.78rem", margin: 0 }}>
            The whole run settles as one atomic Tempo transaction with the fee sponsored, so every
            recipient is paid together and none of them needs gas.
          </p>
        </div>
      </div>
    </div>
  );
}

