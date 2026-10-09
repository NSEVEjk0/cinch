"use client";

/**
 * AccountButton — the header entry point to the self-custodial Cinch account.
 *
 * Logged out: a "Create account" button that opens the sign-up / log-in modal.
 * Logged in: a pill showing the account address, opening a menu with
 * copy-address, view-on-explorer, reveal recovery phrase, and log out.
 */

import { useEffect, useRef, useState } from "react";
import { AccountModal } from "./AccountModal";
import { useCinchAccount } from "@/lib/useSettlement";
import { forgetAccount, storedMnemonic, storedKey } from "@/lib/cinchAccount";
import { shortAddress } from "@/lib/money";
import { useNetwork } from "@/lib/useNetwork";
import { explorerAddressUrl } from "@/lib/tempo";

export function AccountButton() {
  const { address, hasKey } = useCinchAccount();
  const network = useNetwork();
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState<{ phrase: string | null; key: string | null } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setRevealed(null);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  async function copy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  }

  function logOut() {
    if (!window.confirm("Log out of this account? Make sure you've saved your recovery phrase — it's the only way back in.")) return;
    forgetAccount();
    setMenuOpen(false);
    setRevealed(null);
  }

  if (!hasKey || !address) {
    return (
      <>
        <button className="btn btn-primary btn-sm" onClick={() => setModalOpen(true)}>
          Create account
        </button>
        {modalOpen ? <AccountModal onClose={() => setModalOpen(false)} /> : null}
      </>
    );
  }

  return (
    <div style={{ position: "relative" }} ref={menuRef}>
      <button className="btn btn-ghost btn-sm mono" onClick={() => setMenuOpen((v) => !v)} style={{ gap: 8 }}>
        <span className="dot" />
        {shortAddress(address)}
        <span style={{ opacity: 0.5, fontSize: "0.7rem" }}>▾</span>
      </button>
      {menuOpen ? (
        <div
          className="card"
          style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", padding: 6, minWidth: 248, zIndex: 40 }}
        >
          <div style={{ padding: "10px 12px 8px" }}>
            <div className="label" style={{ marginBottom: 4 }}>
              Cinch account · {network.name.replace("Tempo ", "")}
            </div>
            <div className="mono" style={{ fontSize: "0.82rem", wordBreak: "break-all" }}>{address}</div>
          </div>
          <div className="hairline" style={{ margin: "4px 0" }} />
          <MenuItem onClick={copy}>{copied ? "Copied ✓" : "Copy address"}</MenuItem>
          <a
            className="btn btn-quiet btn-sm"
            style={menuItemStyle}
            href={explorerAddressUrl(network, address)}
            target="_blank"
            rel="noreferrer"
            onClick={() => setMenuOpen(false)}
          >
            View on explorer ↗
          </a>
          <MenuItem onClick={() => setRevealed({ phrase: storedMnemonic(), key: storedKey() })}>
            Reveal recovery phrase
          </MenuItem>
          {revealed ? (
            <div style={{ padding: "4px 12px 10px" }}>
              {revealed.phrase ? (
                <>
                  <span className="label">Recovery phrase</span>
                  <p className="mono" style={{ margin: "5px 0 8px", fontSize: "0.76rem", lineHeight: 1.5, wordBreak: "break-word" }}>
                    {revealed.phrase}
                  </p>
                </>
              ) : null}
              <span className="label">Private key</span>
              <p className="mono" style={{ margin: "5px 0 0", fontSize: "0.72rem", wordBreak: "break-all" }}>
                {revealed.key}
              </p>
            </div>
          ) : null}
          <div className="hairline" style={{ margin: "4px 0" }} />
          <MenuItem onClick={logOut} danger>
            Log out
          </MenuItem>
        </div>
      ) : null}
    </div>
  );
}

const menuItemStyle = { width: "100%", justifyContent: "flex-start", textAlign: "left" as const };

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button className="btn btn-quiet btn-sm" style={{ ...menuItemStyle, color: danger ? "var(--neg)" : undefined }} onClick={onClick}>
      {children}
    </button>
  );
}
