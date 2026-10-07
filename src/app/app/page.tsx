"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BackButton } from "@/components/BackButton";
import {
  loadCircles,
  createCircle,
  saveCircle,
  deleteCircle,
  newId,
  type Circle,
} from "@/lib/circle";
import { SCENARIOS, scenarioToCircle } from "@/lib/scenarios";
import { clearRoom } from "@/lib/netting";
import { formatPercent } from "@/lib/money";
import { useNetwork } from "@/lib/useNetwork";
import { parseObligationsCsv } from "@/lib/csv";

export default function AppPage() {
  const router = useRouter();
  const network = useNetwork();
  const [circles, setCircles] = useState<Circle[]>([]);
  const [name, setName] = useState("");
  const [cadence, setCadence] = useState<Circle["cadence"]>("once");
  const [ready, setReady] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    setCircles(loadCircles());
    setReady(true);
  }, []);

  function create() {
    const circle = createCircle({ name, cadence, defaultToken: network.tokens[0] });
    saveCircle(circle);
    router.push(`/circle/${circle.id}`);
  }

  function loadExample(scenarioId: string) {
    const scenario = SCENARIOS.find((s) => s.id === scenarioId)!;
    const circle = scenarioToCircle(scenario, newId());
    saveCircle(circle);
    router.push(`/circle/${circle.id}`);
  }

  function importCsv(text: string) {
    const token = network.tokens[0];
    const parsed = parseObligationsCsv(text, token);
    if (parsed.obligations.length === 0) {
      setImportError(
        parsed.errors[0] ?? "No obligations found. Use: payer, payee, amount, reason — one per line."
      );
      return;
    }
    const circle = createCircle({ name: name.trim() || "Imported circle", cadence, defaultToken: token });
    circle.parties = parsed.parties.map((p) => ({ address: p.address, name: p.name }));
    circle.obligations = parsed.obligations;
    saveCircle(circle);
    router.push(`/circle/${circle.id}`);
  }

  function remove(id: string) {
    if (!window.confirm("Delete this circle? It only lives in this browser.")) return;
    setCircles(deleteCircle(id));
  }

  return (
    <>
      <SiteHeader />
      <main className="shell" style={{ paddingTop: 32, paddingBottom: 40, minHeight: "70vh" }}>
        <div style={{ marginBottom: 20 }}>
          <BackButton fallback="/" label="Home" />
        </div>
        <p className="eyebrow" style={{ marginBottom: 14 }}>
          Circles
        </p>
        <h1 className="display" style={{ fontSize: "clamp(2rem, 4.4vw, 3rem)", marginBottom: 10 }}>
          Your clearing rooms.
        </h1>
        <p className="muted" style={{ maxWidth: "56ch", marginBottom: 40 }}>
          A circle is a set of parties and the debts between them. Open one, drop in the
          obligations, and clear the whole thing in a single settlement.
        </p>

        <div className="split-wide">
          {/* create */}
          <div className="card card-pad">
            <h2 className="display" style={{ fontSize: "1.3rem", marginBottom: 18 }}>
              New circle
            </h2>
            <label className="stack">
              <span className="label">Name</span>
              <input
                className="field"
                placeholder="Q4 contributors"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && name.trim() && create()}
              />
            </label>
            <div className="stack" style={{ marginTop: 18 }}>
              <span className="label">Cadence</span>
              <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
                {(["once", "weekly", "monthly"] as const).map((c) => (
                  <button
                    key={c}
                    className="btn btn-sm"
                    onClick={() => setCadence(c)}
                    style={{
                      borderRadius: 999,
                      border: "1px solid var(--line-strong)",
                      background: cadence === c ? "var(--mint-glow)" : "transparent",
                      color: cadence === c ? "var(--mint-400)" : "var(--text-soft)",
                    }}
                  >
                    {c === "once" ? "One-off (Tally)" : `Standing · ${c}`}
                  </button>
                ))}
              </div>
            </div>
            <p className="faint" style={{ fontSize: "0.82rem", marginTop: 14 }}>
              {cadence === "once"
                ? "A one-off room you clear once and close."
                : "A standing circle that accumulates obligations and clears on a cadence."}
            </p>
            <button
              className="btn btn-primary"
              style={{ marginTop: 22 }}
              onClick={create}
              disabled={!name.trim()}
            >
              Create circle →
            </button>
          </div>

          {/* examples */}
          <div className="card card-pad">
            <h2 className="display" style={{ fontSize: "1.3rem", marginBottom: 8 }}>
              Load an example
            </h2>
            <p className="faint" style={{ fontSize: "0.86rem", marginBottom: 18 }}>
              Start from a real scenario and see it clear instantly.
            </p>
            <div className="stack" style={{ gap: 10 }}>
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  className="btn btn-ghost"
                  style={{ justifyContent: "space-between", width: "100%", textAlign: "left" }}
                  onClick={() => loadExample(s.id)}
                >
                  <span>{s.title}</span>
                  <span className="faint mono" style={{ fontSize: "0.78rem" }}>
                    {s.edges.length} debts →
                  </span>
                </button>
              ))}
            </div>
            <div className="hairline" style={{ margin: "18px 0 14px" }} />
            {!showImport ? (
              <button
                className="btn btn-quiet btn-sm"
                style={{ color: "var(--mint-400)", padding: 0 }}
                onClick={() => setShowImport(true)}
              >
                or import a list of debts (CSV / paste) →
              </button>
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                <span className="label">Paste debts — one per line: payer, payee, amount, reason</span>
                <textarea
                  className="field mono"
                  style={{ minHeight: 110, resize: "vertical" }}
                  placeholder={"Alice, Bob, 100, dinner\nBob, Carol, 60, taxi\nCarol, Alice, 40, tickets"}
                  value={csvText}
                  onChange={(e) => {
                    setCsvText(e.target.value);
                    setImportError(null);
                  }}
                />
                {importError ? (
                  <p style={{ color: "var(--rose-400)", fontSize: "0.84rem", margin: 0 }}>{importError}</p>
                ) : null}
                <div className="row" style={{ gap: 10 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => importCsv(csvText)} disabled={!csvText.trim()}>
                    Import into a circle
                  </button>
                  <button className="btn btn-quiet btn-sm" onClick={() => setShowImport(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* existing circles */}
        {ready && circles.length > 0 ? (
          <div style={{ marginTop: 44 }}>
            <h2 className="display" style={{ fontSize: "1.3rem", marginBottom: 18 }}>
              Saved circles
            </h2>
            <div className="grid" style={{ gap: 12 }}>
              {circles.map((c) => {
                const result = clearRoom(c.obligations);
                return (
                  <div
                    key={c.id}
                    className="card"
                    style={{ padding: "18px 22px" }}
                  >
                    <div className="between wrap" style={{ gap: 14 }}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => router.push(`/circle/${c.id}`)}
                        onKeyDown={(e) => e.key === "Enter" && router.push(`/circle/${c.id}`)}
                        style={{ cursor: "pointer", flex: 1, minWidth: 0 }}
                      >
                        <div className="row" style={{ gap: 10 }}>
                          <span style={{ fontSize: "1.05rem", fontWeight: 540 }}>{c.name}</span>
                          <span className="chip">
                            {c.cadence === "once" ? "one-off" : c.cadence}
                          </span>
                        </div>
                        <div className="faint mono" style={{ fontSize: "0.8rem", marginTop: 6 }}>
                          {c.parties.length} parties · {c.obligations.length} obligations
                          {c.obligations.length > 0
                            ? ` · ${formatPercent(result.stats.compressionRatio)} compressible`
                            : ""}
                        </div>
                      </div>
                      <div className="row" style={{ gap: 8 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => router.push(`/circle/${c.id}`)}>
                          Open
                        </button>
                        <button
                          className="btn btn-quiet btn-sm"
                          style={{ color: "var(--rose-400)" }}
                          onClick={() => remove(c.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </main>
      <SiteFooter />
    </>
  );
}
