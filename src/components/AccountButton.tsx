"use client";

/**
 * AccountButton — the header entry point to a signer identity.
 *
 * Businesses connect their existing wallet (MetaMask/Rabby/EIP-6963); anyone
 * without one can create the self-custodial Cinch account instead. A connected
 * wallet takes precedence. Logged out shows both options; logged in shows the
 * address and a menu (copy, explorer, switch network, disconnect/log out).
 */

import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { AccountModal } from "./AccountModal";
import { useCinchAccount } from "@/lib/useSettlement";
import { forgetAccount, storedMnemonic, storedKey } from "@/lib/cinchAccount";
import { shortAddress } from "@/lib/money";
import { useNetwork } from "@/lib/useNetwork";
import { explorerAddressUrl } from "@/lib/tempo";

export function AccountButton() {
  const network = useNetwork();
  const { address: walletAddress, isConnected } = useAccount();
  const { connectors, connectAsync, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { address: cinchAddress, hasKey } = useCinchAccount();

  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState<{ phrase: string | null; key: string | null } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isWallet = isConnected && !!walletAddress;
  const address = isWallet ? walletAddress! : cinchAddress;
  const loggedIn = isWallet || (hasKey && !!cinchAddress);
  const wrongNetwork = isWallet && chainId !== network.chainId;

  useEffect(() => {
    if (!menuOpen && !connectOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConnectOpen(false);
        setRevealed(null);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen, connectOpen]);

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
    if (isWallet) {
      disconnect();
      setMenuOpen(false);
      return;
    }
    if (!window.confirm("Log out of this account? Make sure you've saved your recovery phrase — it's the only way back in.")) return;
    forgetAccount();
    setMenuOpen(false);
    setRevealed(null);
  }

  // De-duplicate EIP-6963 connectors by name for the connect menu.
  const walletConnectors = connectors.filter((c, i, arr) => arr.findIndex((x) => x.name === c.name) === i);

  async function connect(connectorId: string) {
    const connector = connectors.find((c) => c.id === connectorId);
    if (!connector) return;
    try {
      await connectAsync({ connector });
      setConnectOpen(false);
    } catch {
      /* user rejected or no wallet */
    }
  }

  if (!loggedIn) {
    return (
      <div style={{ position: "relative" }} ref={menuRef}>
        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setConnectOpen((v) => !v)}
            disabled={isPending}
          >
            {isPending ? "Connecting…" : "Connect wallet"}
          </button>
        </div>
        {connectOpen ? (
          <div className="card" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", padding: 6, minWidth: 240, zIndex: 40 }}>
            <div className="label" style={{ padding: "8px 12px 6px" }}>Connect a wallet</div>
            {walletConnectors.length === 0 ? (
              <p className="faint" style={{ padding: "0 12px 8px", fontSize: "0.8rem" }}>
                No wallet detected. Install MetaMask or Rabby, or use a Cinch account below.
              </p>
            ) : (
              walletConnectors.map((c) => (
                <button key={c.id} className="btn btn-quiet btn-sm" style={menuItemStyle} onClick={() => connect(c.id)}>
                  {c.name}
                </button>
              ))
            )}
            <div className="hairline" style={{ margin: "4px 0" }} />
            <button
              className="btn btn-quiet btn-sm"
              style={menuItemStyle}
              onClick={() => { setConnectOpen(false); setModalOpen(true); }}
            >
              or create a Cinch account
            </button>
          </div>
        ) : null}
        {modalOpen ? <AccountModal onClose={() => setModalOpen(false)} /> : null}
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }} ref={menuRef}>
      <div className="row" style={{ gap: 6 }}>
        {wrongNetwork ? (
          <button className="btn btn-sm" style={{ background: "var(--amber-400)", color: "#000" }} onClick={() => switchChain({ chainId: network.chainId })}>
            Switch to {network.name.replace("Tempo ", "")}
          </button>
        ) : null}
        <button className="btn btn-ghost btn-sm mono" onClick={() => setMenuOpen((v) => !v)} style={{ gap: 8 }}>
          <span className="dot" />
          {shortAddress(address!)}
          <span style={{ opacity: 0.5, fontSize: "0.7rem" }}>▾</span>
        </button>
      </div>
      {menuOpen ? (
        <div className="card" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", padding: 6, minWidth: 248, zIndex: 40 }}>
          <div style={{ padding: "10px 12px 8px" }}>
            <div className="label" style={{ marginBottom: 4 }}>
              {isWallet ? "Connected wallet" : "Cinch account"} · {network.name.replace("Tempo ", "")}
            </div>
            <div className="mono" style={{ fontSize: "0.82rem", wordBreak: "break-all" }}>{address}</div>
          </div>
          <div className="hairline" style={{ margin: "4px 0" }} />
          <MenuItem onClick={copy}>{copied ? "Copied ✓" : "Copy address"}</MenuItem>
          <a
            className="btn btn-quiet btn-sm"
            style={menuItemStyle}
            href={explorerAddressUrl(network, address!)}
            target="_blank"
            rel="noreferrer"
            onClick={() => setMenuOpen(false)}
          >
            View on explorer ↗
          </a>
          {!isWallet ? (
            <MenuItem onClick={() => setRevealed({ phrase: storedMnemonic(), key: storedKey() })}>
              Reveal recovery phrase
            </MenuItem>
          ) : null}
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
            {isWallet ? "Disconnect" : "Log out"}
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
