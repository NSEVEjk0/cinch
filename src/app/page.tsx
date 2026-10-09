import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { HeroDemo } from "@/components/HeroDemo";
import { PROBLEM, HOW, FEATURES, WHY_TEMPO, FAQ } from "@/lib/brand";

export default function HomePage() {
  return (
    <>
      <SiteHeader />

      {/* ------------------------------- hero ------------------------------- */}
      <section style={{ position: "relative", overflow: "hidden" }}>
        <div className="mesh"><span className="bloom" /></div>
        <div className="grid-texture" />
        <div className="shell" style={{ position: "relative", zIndex: 1, paddingTop: 84, paddingBottom: 56 }}>
          <div className="split">
            <div className="rise">
              <div className="chip chip-mint" style={{ marginBottom: 24 }}>
                <span className="dot" /> Multilateral settlement · on Tempo
              </div>
              <h1 className="display" style={{ fontSize: "clamp(2.7rem, 5.8vw, 4.3rem)" }}>
                Clear the circle,<br />not every debt.
              </h1>
              <p className="lead" style={{ maxWidth: "47ch", margin: "22px 0 34px" }}>
                Cinch nets a tangle of IOUs down to the fewest possible transfers, then settles the
                whole cleared circle in one atomic transaction. Nobody goes first. Nobody is left
                short.
              </p>
              <div className="row wrap" style={{ gap: 12 }}>
                <Link href="/app" className="btn btn-primary btn-lg">
                  Open a circle
                </Link>
                <Link href="/how" className="btn btn-ghost btn-lg">
                  How it works
                </Link>
              </div>
              <p className="faint" style={{ marginTop: 20, fontSize: "0.85rem" }}>
                Cinch is its own self-custodial wallet. Create an account in seconds — no extension to install.
              </p>
            </div>

            <div className="rise" style={{ animationDelay: "0.08s" }}>
              <HeroDemo />
            </div>
          </div>

          {/* trust row */}
          <div className="logobar" style={{ marginTop: 72 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.68rem", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-3)" }}>
              Built on
            </span>
            <span>Tempo</span>
            <span>TIP-20 memos</span>
            <span>Atomic batches</span>
            <span>Enshrined stable DEX</span>
          </div>
        </div>
      </section>

      {/* ------------------------------ problem ----------------------------- */}
      <section className="shell section">
        <div style={{ maxWidth: 720 }}>
          <p className="eyebrow" style={{ marginBottom: 20 }}>
            The problem
          </p>
          <h2 className="display" style={{ fontSize: "clamp(1.9rem, 4vw, 2.9rem)" }}>
            {PROBLEM.heading}
          </h2>
          <p className="lead" style={{ marginTop: 22 }}>{PROBLEM.body}</p>
        </div>
      </section>

      {/* --------------------------- how it works --------------------------- */}
      <section className="shell section" style={{ paddingTop: 0 }}>
        <div className="g3 stagger">
          {HOW.map((h) => (
            <div key={h.step} className="feature-card">
              <div className="mono" style={{ color: "var(--accent)", fontSize: "0.82rem", marginBottom: 16 }}>
                {h.step}
              </div>
              <h3 className="display" style={{ fontSize: "1.28rem", marginBottom: 10, letterSpacing: "-0.02em" }}>
                {h.title}
              </h3>
              <p className="muted" style={{ fontSize: "0.94rem", lineHeight: 1.62, margin: 0 }}>
                {h.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ----------------------------- features ----------------------------- */}
      <section className="shell section" style={{ paddingTop: 0 }}>
        <div style={{ marginBottom: 40, maxWidth: 620 }}>
          <p className="eyebrow" style={{ marginBottom: 18 }}>
            What makes it hold
          </p>
          <h2 className="display" style={{ fontSize: "clamp(1.8rem, 3.6vw, 2.5rem)" }}>
            A clearinghouse, not a group-pay app.
          </h2>
        </div>
        <div className="g3 stagger">
          {FEATURES.map((f) => (
            <div key={f.title} className="feature-card">
              <h3 className="display" style={{ fontSize: "1.12rem", marginBottom: 11, letterSpacing: "-0.02em" }}>
                {f.title}
              </h3>
              <p className="muted" style={{ fontSize: "0.9rem", lineHeight: 1.62, margin: 0 }}>
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------- why tempo ----------------------------- */}
      <section className="shell section" style={{ paddingTop: 0 }}>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "34px 34px 26px", borderBottom: "1px solid var(--hairline)" }}>
            <p className="eyebrow" style={{ marginBottom: 16 }}>
              Why Tempo
            </p>
            <h2 className="display" style={{ fontSize: "clamp(1.6rem, 3.2vw, 2.2rem)", maxWidth: "24ch" }}>
              Built out of Tempo&apos;s primitives — it couldn&apos;t work the same way elsewhere.
            </h2>
          </div>
          <div className="g2" style={{ gap: 1, background: "var(--hairline)" }}>
            {WHY_TEMPO.map((w) => (
              <div key={w.primitive} style={{ padding: "22px 34px", background: "var(--surface)" }}>
                <div className="mono" style={{ color: "var(--accent)", fontSize: "0.86rem", marginBottom: 7 }}>
                  {w.primitive}
                </div>
                <p className="muted" style={{ margin: 0, fontSize: "0.92rem", lineHeight: 1.58 }}>
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
        <div>
          {FAQ.map((item, i) => (
            <div
              key={i}
              style={{
                padding: "22px 0",
                borderTop: "1px solid var(--hairline)",
                borderBottom: i === FAQ.length - 1 ? "1px solid var(--hairline)" : "none",
              }}
            >
              <div className="faq-row" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.6fr)", gap: 32 }}>
                <h3 className="display" style={{ fontSize: "1.08rem", margin: 0, letterSpacing: "-0.02em" }}>
                  {item.q}
                </h3>
                <p className="muted" style={{ margin: 0, lineHeight: 1.62 }}>
                  {item.a}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------- cta -------------------------------- */}
      <section className="shell" style={{ paddingBottom: 110 }}>
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            padding: "60px 40px",
            textAlign: "center",
            borderRadius: "var(--r-xl)",
            border: "1px solid var(--hairline-2)",
            background: "linear-gradient(180deg, var(--surface) 0%, var(--bg-raised) 100%)",
          }}
        >
          <div className="mesh" style={{ opacity: 0.7 }}><span className="bloom" /></div>
          <div style={{ position: "relative", zIndex: 1 }}>
            <h2 className="display" style={{ fontSize: "clamp(1.9rem, 4vw, 2.9rem)", maxWidth: "18ch", margin: "0 auto" }}>
              Stop paying gross.
            </h2>
            <p className="lead" style={{ maxWidth: "44ch", margin: "18px auto 30px" }}>
              Open a circle, drop in the debts, and watch a tangle become one settlement.
            </p>
            <Link href="/app" className="btn btn-primary btn-lg">
              Open a circle
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
