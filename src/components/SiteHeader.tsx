"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { WalletButton } from "./WalletButton";

const LINKS = [
  { href: "/app", label: "Circles" },
  { href: "/how", label: "How it works" },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        backdropFilter: "blur(14px)",
        background: "rgba(8,11,15,0.72)",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <div
        className="shell between"
        style={{ height: 64 }}
      >
        <Link href="/" aria-label="Cinch home">
          <Logo />
        </Link>

        <nav className="row" style={{ gap: 6 }}>
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname?.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                className="btn btn-quiet btn-sm"
                style={{
                  color: active ? "var(--text)" : "var(--text-soft)",
                  fontWeight: active ? 540 : 500,
                }}
              >
                {l.label}
              </Link>
            );
          })}
          <span style={{ width: 10 }} />
          <WalletButton />
        </nav>
      </div>
    </header>
  );
}
