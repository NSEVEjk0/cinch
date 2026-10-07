import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { HOW, WHY_TEMPO, BRAND } from "@/lib/brand";

export const metadata = { title: "How it works" };

export default function HowPage() {
  return (
    <>
      <SiteHeader />
      <main className="shell" style={{ paddingTop: 56, paddingBottom: 40 }}>
        <p className="eyebrow" style={{ marginBottom: 16 }}>
          How it works
        </p>
        <h1 className="display" style={{ fontSize: "clamp(2.2rem, 4.6vw, 3.2rem)", maxWidth: "18ch" }}>
          From a tangle of debts to one settlement.
        </h1>
        <p className="muted" style={{ fontSize: "1.08rem", maxWidth: "56ch", marginTop: 20 }}>
          {BRAND.oneLiner}
        </p>

        {/* steps */}
        <div className="stack" style={{ gap: 20, marginTop: 48 }}>
          {HOW.map((h) => (
            <div key={h.step} className="card card-pad" style={{ padding: 30 }}>
              <div className="grid" style={{ gridTemplateColumns: "80px 1fr", gap: 24, alignItems: "start" }}>
                <div
                  className="mono"
                  style={{ color: "var(--mint-400)", fontSize: "1.6rem", fontWeight: 500 }}
                >
                  {h.step}
                </div>
                <div>
                  <h2 className="display" style={{ fontSize: "1.5rem", marginBottom: 10 }}>
                    {h.title}
                  </h2>
                  <p className="muted" style={{ margin: 0, lineHeight: 1.7, fontSize: "1rem" }}>
                    {h.body}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* the math, explained */}
        <section className="section" style={{ paddingBottom: 40 }}>
          <h2 className="display" style={{ fontSize: "clamp(1.6rem, 3.2vw, 2.2rem)", marginBottom: 20 }}>
            Why netting moves so much less money
          </h2>
          <div className="card card-pad" style={{ padding: 32 }}>
            <p className="muted" style={{ marginTop: 0, lineHeight: 1.75 }}>
              Imagine three parties: <strong>A owes B 100</strong>, <strong>B owes C 100</strong>, and{" "}
              <strong>C owes A 100</strong>. Paid one at a time, that is 300 moving across three
              transfers. But look at each party&apos;s <em>net</em> position: A is down 100 and up
              100 — square. So is everyone. The circle cancels, and the right number of transfers is
              zero.
            </p>
            <p className="muted" style={{ lineHeight: 1.75 }}>
              Real circles are rarely perfectly balanced, so Cinch computes each party&apos;s net
              position and finds the smallest set of transfers that leaves everyone square — the net
              debtors paying exactly their shortfall to the net creditors. For <em>n</em> parties the
              result is at most <em>n−1</em> transfers, usually far fewer than the obligations you
              started with.
            </p>
            <p className="muted" style={{ lineHeight: 1.75, marginBottom: 0 }}>
              Then the whole set is submitted to Tempo as a single atomic transaction, so the moment
              it settles, every debt in the round is discharged at once.
            </p>
          </div>
        </section>

        {/* why tempo */}
        <section style={{ paddingBottom: 20 }}>
          <h2 className="display" style={{ fontSize: "clamp(1.6rem, 3.2vw, 2.2rem)", marginBottom: 24 }}>
            The Tempo primitives it leans on
          </h2>
          <div className="grid" style={{ gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
            {WHY_TEMPO.map((w) => (
              <div key={w.primitive} className="card card-pad" style={{ padding: 24 }}>
                <div className="mono" style={{ color: "var(--mint-400)", fontSize: "0.92rem", marginBottom: 8 }}>
                  {w.primitive}
                </div>
                <p className="muted" style={{ margin: 0, fontSize: "0.96rem", lineHeight: 1.6 }}>
                  {w.use}
                </p>
              </div>
            ))}
          </div>
        </section>

        <div className="row" style={{ gap: 14, marginTop: 32 }}>
          <Link href="/app" className="btn btn-primary">
            Open a circle →
          </Link>
          <Link href="/" className="btn btn-ghost">
            Back home
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
