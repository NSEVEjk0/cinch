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
            {BRAND.tagline}
          </p>
          <a
            href={BRAND.repoUrl}
            className="faint"
            style={{ fontSize: "0.85rem" }}
            target="_blank"
            rel="noreferrer"
          >
            View the source on GitHub →
          </a>
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
