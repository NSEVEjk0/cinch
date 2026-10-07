import Link from "next/link";
import { Logo } from "./Logo";
import { BRAND } from "@/lib/brand";

export function SiteFooter() {
  return (
    <footer style={{ borderTop: "1px solid var(--line)", marginTop: 40 }}>
      <div
        className="shell between wrap"
        style={{ padding: "32px 28px", gap: 20, alignItems: "flex-start" }}
      >
        <div className="stack" style={{ gap: 10, maxWidth: 360 }}>
          <Logo />
          <p className="faint" style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.6 }}>
            {BRAND.tagline} Built for the {BRAND.track}.
          </p>
        </div>
        <div className="row wrap" style={{ gap: 28, alignItems: "flex-start" }}>
          <div className="stack" style={{ gap: 8 }}>
            <span className="label">Product</span>
            <Link href="/app" className="faint" style={linkStyle}>
              Circles
            </Link>
            <Link href="/how" className="faint" style={linkStyle}>
              How it works
            </Link>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <span className="label">More</span>
            <a href={BRAND.repoUrl} className="faint" style={linkStyle} target="_blank" rel="noreferrer">
              Source
            </a>
            <a href={BRAND.xUrl} className="faint" style={linkStyle} target="_blank" rel="noreferrer">
              Updates
            </a>
          </div>
        </div>
      </div>
      <div className="shell" style={{ padding: "0 28px 28px" }}>
        <p className="faint" style={{ fontSize: "0.78rem", margin: 0 }}>
          Runs on the Tempo Moderato testnet by default — nothing real moves while you explore.
        </p>
      </div>
    </footer>
  );
}

const linkStyle = { fontSize: "0.9rem" } as const;
