"use client";

import { useAccount, useConnect, useDisconnect, injected } from "wagmi";
import { shortAddress } from "@/lib/money";
import { useState } from "react";

/**
 * Wallet connect / disconnect pill. Uses the injected connector (MetaMask,
 * Rabby, …). Shows a shortened address and a quiet disconnect on click.
 */
export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);

  if (!isConnected || !address) {
    return (
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => connect({ connector: injected() })}
        disabled={isPending}
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        className="btn btn-ghost btn-sm mono"
        onClick={() => setOpen((v) => !v)}
        style={{ gap: 8 }}
      >
        <span className="dot" />
        {shortAddress(address)}
      </button>
      {open ? (
        <div
          className="card"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            padding: 8,
            minWidth: 160,
            zIndex: 30,
          }}
        >
          <button
            className="btn btn-quiet btn-sm"
            style={{ width: "100%", justifyContent: "flex-start" }}
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
          >
            Disconnect
          </button>
        </div>
      ) : null}
    </div>
  );
}
