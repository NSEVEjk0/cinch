"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
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

export default function AppPage() {
  const router = useRouter();
  const [circles, setCircles] = useState<Circle[]>([]);
  const [name, setName] = useState("");
  const [cadence, setCadence] = useState<Circle["cadence"]>("once");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setCircles(loadCircles());
    setReady(true);
  }, []);

  function create() {
    const circle = createCircle({ name, cadence });
    saveCircle(circle);
    router.push(`/circle/${circle.id}`);
  }

  function loadExample(scenarioId: string) {
    const scenario = SCENARIOS.find((s) => s.id === scenarioId)!;
    const circle = scenarioToCircle(scenario, newId());
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
      <main className="shell" style={{ paddingTop: 48, paddingBottom: 40, minHeight: "70vh" }}>
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

        <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)", gap: 24 }}>
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
