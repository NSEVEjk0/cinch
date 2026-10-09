"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { WalletButton } from "./WalletButton";
import { NetworkSwitch } from "./NetworkSwitch";

const LINKS = [
  { href: "/app", label: "Circles" },
  { href: "/how", label: "How it works" },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="nav">
      <div className="shell between" style={{ height: "100%" }}>
        <Link href="/" aria-label="Cinch home" style={{ display: "flex" }}>
          <Logo />
        </Link>

        <nav className="row" style={{ gap: 4 }}>
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname?.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                className="nav-link nav-link-text"
                data-active={active || undefined}
              >
                {l.label}
              </Link>
            );
          })}
          <span className="net-switch-wrap" style={{ margin: "0 6px" }}>
            <NetworkSwitch />
          </span>
          <WalletButton />
        </nav>
      </div>
    </header>
  );
}
