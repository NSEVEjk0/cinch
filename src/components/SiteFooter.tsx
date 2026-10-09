import { Logo } from "./Logo";
import { BRAND } from "@/lib/brand";

export function SiteFooter() {
  return (
    <footer style={{ borderTop: "1px solid var(--line)", marginTop: 40 }}>
      <div
        className="shell between wrap"
        style={{ padding: "32px 28px", gap: 24, alignItems: "flex-start" }}
      >
        <div className="stack" style={{ gap: 10, maxWidth: 360 }}>
          <Logo />
          <p className="faint" style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.6 }}>
            {BRAND.tagline}
          </p>
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          <a href={BRAND.xUrl} className="btn btn-ghost btn-sm" target="_blank" rel="noreferrer">
            <XGlyph /> Say hello
          </a>
          <a href={BRAND.repoUrl} className="btn btn-quiet btn-sm" target="_blank" rel="noreferrer">
            Source ↗
          </a>
        </div>
      </div>
    </footer>
  );
}

function XGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
