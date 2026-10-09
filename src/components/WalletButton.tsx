"use client";

/**
 * Wallet connect — a standard, polished connect flow.
 *
 * Disconnected: a "Connect wallet" button that opens a modal listing the
 * available connectors (injected browser wallets, with a graceful message when
 * none is detected).
 * Connected: a pill showing a live status dot and the short address, opening a
 * menu with copy-address, view-on-explorer, and disconnect.
 */

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useEffect, useRef, useState } from "react";
import { shortAddress } from "@/lib/money";
import { useNetwork } from "@/lib/useNetwork";
import { explorerAddressUrl } from "@/lib/tempo";

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const network = useNetwork();

  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the connected-menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  // Close the connect modal once a connection lands.
  useEffect(() => {
    if (isConnected) setModalOpen(false);
  }, [isConnected]);

  async function copy() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  if (!isConnected || !address) {
    return (
      <>
        <button className="btn btn-primary btn-sm" onClick={() => setModalOpen(true)}>
          Connect wallet
        </button>
        {modalOpen ? (
          <ConnectModal
            connectors={connectors}
            isPending={isPending}
            error={error}
            onConnect={(c) => connect({ connector: c })}
            onClose={() => setModalOpen(false)}
          />
        ) : null}
      </>
    );
  }

  return (
    <div style={{ position: "relative" }} ref={menuRef}>
      <button
        className="btn btn-ghost btn-sm mono"
        onClick={() => setMenuOpen((v) => !v)}
        style={{ gap: 8 }}
      >
        <span className="dot" />
        {shortAddress(address)}
        <span style={{ opacity: 0.5, fontSize: "0.7rem" }}>▾</span>
      </button>
      {menuOpen ? (
        <div
          className="card"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            padding: 6,
            minWidth: 220,
            zIndex: 40,
          }}
        >
          <div style={{ padding: "10px 12px 8px" }}>
            <div className="label" style={{ marginBottom: 4 }}>
              Connected · {network.name.replace("Tempo ", "")}
            </div>
            <div className="mono" style={{ fontSize: "0.82rem", wordBreak: "break-all" }}>
              {address}
            </div>
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
          <MenuItem
            onClick={() => {
              disconnect();
              setMenuOpen(false);
            }}
            danger
          >
            Disconnect
          </MenuItem>
        </div>
      ) : null}
    </div>
  );
}

function ConnectModal({
  connectors,
  isPending,
  error,
  onConnect,
  onClose,
}: {
  connectors: readonly import("wagmi").Connector[];
  isPending: boolean;
  error: Error | null;
  onConnect: (c: import("wagmi").Connector) => void;
  onClose: () => void;
}) {
  // De-duplicate connectors by name (wagmi can list the same wallet twice).
  const seen = new Set<string>();
  const unique = connectors.filter((c) => {
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Connect a wallet">
        <div className="between" style={{ marginBottom: 6 }}>
          <h2 className="display" style={{ fontSize: "1.3rem", margin: 0 }}>
            Connect a wallet
          </h2>
          <button className="btn btn-quiet btn-sm" style={{ padding: 6 }} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="faint" style={{ fontSize: "0.86rem", margin: "0 0 18px" }}>
          Your wallet is your identity on Cinch. Nothing is held on a server.
        </p>

        <div className="stack" style={{ gap: 10 }}>
          {unique.length === 0 ? (
            <div className="card" style={{ padding: 16 }}>
              <p className="muted" style={{ margin: 0, fontSize: "0.92rem" }}>
                No browser wallet detected. Install MetaMask, Rabby, or another injected wallet, then
                reload this page.
              </p>
            </div>
          ) : (
            unique.map((c) => (
              <button
                key={c.uid}
                className="btn btn-ghost"
                style={{ justifyContent: "space-between", width: "100%" }}
                onClick={() => onConnect(c)}
                disabled={isPending}
              >
                <span className="row" style={{ gap: 10 }}>
                  <WalletGlyph name={c.name} />
                  {c.name}
                </span>
                <span className="faint" style={{ fontSize: "0.8rem" }}>
                  {isPending ? "…" : "Connect →"}
                </span>
              </button>
            ))
          )}
        </div>

        {error ? (
          <p style={{ color: "var(--rose-400)", fontSize: "0.85rem", marginTop: 14 }}>
            {error.message.split("\n")[0]}
          </p>
        ) : null}

        <p className="faint" style={{ fontSize: "0.78rem", marginTop: 18, marginBottom: 0 }}>
          Cinch runs on Tempo. You can pick mainnet or testnet from the network switch beside this
          button.
        </p>
      </div>
    </div>
  );
}

function WalletGlyph({ name }: { name: string }) {
  const letter = name.trim().charAt(0).toUpperCase() || "W";
  return (
    <span
      aria-hidden="true"
      style={{
        width: 26,
        height: 26,
        borderRadius: 7,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "0.82rem",
        fontWeight: 600,
        color: "var(--accent-ink)",
        background: "linear-gradient(180deg, var(--accent), var(--accent-2))",
      }}
    >
      {letter}
    </span>
  );
}

const menuItemStyle = {
  width: "100%",
  justifyContent: "flex-start",
  textAlign: "left" as const,
};

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      className="btn btn-quiet btn-sm"
      style={{ ...menuItemStyle, color: danger ? "var(--rose-400)" : undefined }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
