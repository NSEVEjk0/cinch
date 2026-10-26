import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BackButton } from "@/components/BackButton";
import { AgentLive } from "@/components/AgentLive";
import { GrantPolicyPanel } from "@/components/GrantPolicyPanel";
import { AGENT } from "@/lib/brand";

export const metadata = { title: "Cinch Agent" };

export default function AgentPage() {
  return (
    <>
      <SiteHeader />
      <main className="shell" style={{ paddingTop: 32, paddingBottom: 40 }}>
        <div style={{ marginBottom: 20 }}>
          <BackButton fallback="/" label="Home" />
        </div>
        <p className="eyebrow" style={{ marginBottom: 16, color: "var(--pos)" }}>
          {AGENT.eyebrow}
        </p>
        <h1 className="display" style={{ fontSize: "clamp(2.2rem, 4.6vw, 3.2rem)", maxWidth: "20ch" }}>
          {AGENT.heading}
        </h1>
        <p className="muted" style={{ fontSize: "1.08rem", maxWidth: "60ch", marginTop: 20 }}>
          {AGENT.intro}
        </p>

        {/* Live demo */}
        <div style={{ marginTop: 40 }}>
          <AgentLive />
        </div>

        {/* Grant a standing policy */}
        <div style={{ marginTop: 24 }}>
          <GrantPolicyPanel />
        </div>

        {/* How it works */}
        <div className="stack" style={{ gap: 20, marginTop: 48 }}>
          {AGENT.how.map((h) => (
            <div key={h.step} className="card card-pad" style={{ padding: 30 }}>
              <div className="grid" style={{ gridTemplateColumns: "80px 1fr", gap: 24, alignItems: "start" }}>
                <div className="mono" style={{ color: "var(--mint-400)", fontSize: "1.6rem", fontWeight: 500 }}>
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

        {/* Benefits */}
        <div className="g2" style={{ gap: 1, background: "var(--hairline)", borderRadius: "var(--r-xl)", overflow: "hidden", border: "1px solid var(--hairline)", marginTop: 48 }}>
          {AGENT.benefits.map((b) => (
            <div key={b.title} style={{ padding: "22px 30px", background: "var(--surface)" }}>
              <h3 className="display" style={{ fontSize: "1.05rem", marginBottom: 8, letterSpacing: "-0.02em" }}>
                {b.title}
              </h3>
              <p className="muted" style={{ margin: 0, fontSize: "0.92rem", lineHeight: 1.58 }}>
                {b.body}
              </p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 40, textAlign: "center" }}>
          <Link href="/app" className="btn btn-primary btn-lg">
            Open a circle
          </Link>
          <span className="faint" style={{ marginLeft: 14, fontSize: "0.85rem" }}>
            or see the manual flow in How it works
          </span>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
