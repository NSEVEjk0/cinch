import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { HeroDemo } from "@/components/HeroDemo";
import { BRAND, PROBLEM, HOW, FEATURES, WHY_TEMPO, FAQ } from "@/lib/brand";

export default function HomePage() {
  return (
    <>
      <SiteHeader />

      {/* ------------------------------- hero ------------------------------- */}
      <section className="shell" style={{ paddingTop: 72, paddingBottom: 40 }}>
        <div
          className="grid"
          style={{
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gap: 56,
            alignItems: "center",
          }}
        >
          <div className="rise">
            <div className="chip chip-mint" style={{ marginBottom: 22 }}>
              <span className="dot" /> On Tempo · atomic settlement
            </div>
            <h1 className="display" style={{ fontSize: "clamp(2.6rem, 5.6vw, 4.1rem)" }}>
              Net it out.<br />
              Settle the whole<br />
              circle in one move.
            </h1>
            <p
              className="muted"
              style={{ fontSize: "1.12rem", maxWidth: "48ch", margin: "24px 0 34px" }}
            >
              {BRAND.name} collapses a tangle of debts between people into the fewest possible
              transfers, then settles the entire cleared circle as a single atomic transaction on
              Tempo. Nobody goes first. Nobody is left short.
            </p>
            <div className="row wrap" style={{ gap: 14 }}>
              <Link href="/app" className="btn btn-primary">
                Open a circle →
              </Link>
              <Link href="/how" className="btn btn-ghost">
                How it works
              </Link>
            </div>
            <p className="faint" style={{ marginTop: 20, fontSize: "0.85rem" }}>
              No sign-up. Your wallet is your identity. Runs on testnet by default.
            </p>
          </div>

          <div className="rise" style={{ animationDelay: "0.1s" }}>
            <HeroDemo />
          </div>
        </div>
      </section>

      {/* ------------------------------ problem ----------------------------- */}
      <section className="shell section">
        <div style={{ maxWidth: 760 }}>
          <p className="eyebrow" style={{ marginBottom: 18 }}>
            The problem
          </p>
          <h2 className="display" style={{ fontSize: "clamp(1.9rem, 4vw, 2.9rem)" }}>
            {PROBLEM.heading}
          </h2>
          <p className="muted" style={{ fontSize: "1.08rem", marginTop: 22, lineHeight: 1.7 }}>
            {PROBLEM.body}
          </p>
        </div>
      </section>

      {/* --------------------------- how it works --------------------------- */}
      <section className="shell section" style={{ paddingTop: 0 }}>
        <div className="grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {HOW.map((h) => (
            <div key={h.step} className="card card-pad" style={{ padding: 28 }}>
              <div
                className="mono"
                style={{ color: "var(--mint-400)", fontSize: "0.9rem", marginBottom: 18 }}
              >
                {h.step}
              </div>
              <h3 className="display" style={{ fontSize: "1.35rem", marginBottom: 10 }}>
                {h.title}
              </h3>
              <p className="muted" style={{ fontSize: "0.96rem", lineHeight: 1.65, margin: 0 }}>
                {h.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ----------------------------- features ----------------------------- */}
      <section className="shell section" style={{ paddingTop: 0 }}>
        <div className="between wrap" style={{ marginBottom: 36, alignItems: "flex-end" }}>
          <div>
            <p className="eyebrow" style={{ marginBottom: 16 }}>
              What makes it hold
            </p>
            <h2 className="display" style={{ fontSize: "clamp(1.8rem, 3.6vw, 2.6rem)", maxWidth: "16ch" }}>
              A clearinghouse, not a group-pay app.
            </h2>
          </div>
        </div>
        <div className="grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
          {FEATURES.map((f) => (
            <div key={f.title} className="card card-pad" style={{ padding: 26 }}>
              <h3 className="display" style={{ fontSize: "1.18rem", marginBottom: 12 }}>
                {f.title}
              </h3>
              <p className="muted" style={{ fontSize: "0.93rem", lineHeight: 1.65, margin: 0 }}>
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------- why tempo ----------------------------- */}
      <section className="shell section" style={{ paddingTop: 0 }}>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="card-pad" style={{ padding: 32, borderBottom: "1px solid var(--line)" }}>
            <p className="eyebrow" style={{ marginBottom: 16 }}>
              Why Tempo
            </p>
            <h2 className="display" style={{ fontSize: "clamp(1.6rem, 3.2vw, 2.3rem)", maxWidth: "22ch" }}>
              Built out of Tempo's primitives — it could not work the same way elsewhere.
            </h2>
          </div>
          <div className="grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
            {WHY_TEMPO.map((w, i) => (
              <div
                key={w.primitive}
                style={{
                  padding: "22px 32px",
                  borderBottom: i < WHY_TEMPO.length - (WHY_TEMPO.length % 2 === 0 ? 2 : 1) ? "1px solid var(--line)" : "none",
                  borderRight: i % 2 === 0 ? "1px solid var(--line)" : "none",
                }}
              >
                <div className="mono" style={{ color: "var(--mint-400)", fontSize: "0.9rem", marginBottom: 7 }}>
                  {w.primitive}
                </div>
                <p className="muted" style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.6 }}>
                  {w.use}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------- faq -------------------------------- */}
      <section className="shell section" style={{ paddingTop: 0 }}>
        <p className="eyebrow" style={{ marginBottom: 26 }}>
          Questions
        </p>
        <div className="grid" style={{ gap: 0 }}>
          {FAQ.map((item, i) => (
            <div
              key={i}
              style={{
                padding: "24px 0",
                borderTop: "1px solid var(--line)",
                borderBottom: i === FAQ.length - 1 ? "1px solid var(--line)" : "none",
              }}
            >
              <div
                className="grid"
                style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.6fr)", gap: 32 }}
              >
                <h3 className="display" style={{ fontSize: "1.12rem", margin: 0 }}>
                  {item.q}
                </h3>
                <p className="muted" style={{ margin: 0, lineHeight: 1.65 }}>
                  {item.a}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------- cta -------------------------------- */}
      <section className="shell" style={{ paddingBottom: 100 }}>
        <div
          className="card card-pad glow-ring"
          style={{
            padding: 56,
            textAlign: "center",
            background:
              "radial-gradient(600px 300px at 50% 0%, rgba(79,227,176,0.08), transparent 70%), linear-gradient(180deg, var(--ink-800), var(--ink-850))",
          }}
        >
          <h2 className="display" style={{ fontSize: "clamp(1.9rem, 4vw, 2.8rem)", maxWidth: "18ch", margin: "0 auto" }}>
            Stop paying gross. Clear the circle.
          </h2>
          <p className="muted" style={{ fontSize: "1.05rem", maxWidth: "46ch", margin: "20px auto 32px" }}>
            Open a circle, drop in the debts, and watch a tangle become one settlement.
          </p>
          <Link href="/app" className="btn btn-primary" style={{ fontSize: "1rem", padding: "14px 28px" }}>
            Open a circle →
          </Link>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
