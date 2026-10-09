"use client";

/**
 * CinchAccountCard — manage the opt-in self-custodial Cinch account.
 *
 * Create or import a Tempo-native account that lives in this browser, switch it
 * on as the active signer, see its address, fund it from the faucet, export the
 * key, or forget it. It is the one place the raw key is touched, so it is also
 * where the trade-off is spelled out plainly.
 */

import { useState } from "react";
import {
  createAccount,
  importAccount,
  setAccountOn,
  forgetAccount,
  storedKey,
  accountSponsors,
} from "@/lib/cinchAccount";
import { useCinchAccount } from "@/lib/useSettlement";
import { useNetwork } from "@/lib/useNetwork";
import { accountAddress } from "@/lib/cinchAccount";
import { shortAddress } from "@/lib/money";
import { explorerAddressUrl } from "@/lib/tempo";

export function CinchAccountCard() {
  const network = useNetwork();
  const { enabled, hasKey } = useCinchAccount();
  const [importing, setImporting] = useState(false);
  const [importValue, setImportValue] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const address = accountAddress();

  function create() {
    setError(null);
    createAccount();
    setAccountOn(true);
    setOpen(true);
  }
  function doImport() {
    setError(null);
    try {
      importAccount(importValue);
      setAccountOn(true);
      setImporting(false);
      setImportValue("");
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That key could not be read.");
    }
  }
  function forget() {
    if (!window.confirm("Forget this account? The key is erased from this browser and cannot be recovered. Export it first if it holds anything.")) return;
    forgetAccount();
    setRevealed(null);
    setOpen(false);
  }

  return (
    <div className="card card-pad">
      <div className="between" style={{ marginBottom: 8 }}>
        <span className="label">Cinch account</span>
        {hasKey ? <span className={`chip ${enabled ? "chip-mint" : ""}`}>{enabled ? "active signer" : "off"}</span> : null}
      </div>
      <p className="faint" style={{ margin: "0 0 14px", fontSize: "0.86rem", lineHeight: 1.55 }}>
        A self-custodial, Tempo-native account that lives in this browser. It is the only signer
        that settles a whole circle as one atomic transaction with the fee sponsored — a generic
        wallet signs each leg plainly instead. Opt-in, off by default.
      </p>

      {!hasKey ? (
        <>
          <div
            style={{
              padding: 12,
              borderRadius: "var(--r-xs)",
              border: "1px solid var(--hairline)",
              background: "rgba(183,121,31,0.08)",
              marginBottom: 14,
            }}
          >
            <p className="faint" style={{ margin: 0, fontSize: "0.82rem" }}>
              ⚠ The key is stored unencrypted in this browser. Treat it as a testnet convenience,
              not a place to keep real money.
            </p>
          </div>
          <div className="row wrap" style={{ gap: 10 }}>
            <button className="btn btn-primary btn-sm" onClick={create}>
              Create an account
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setImporting((v) => !v)}>
              {importing ? "Cancel" : "Import a key"}
            </button>
          </div>
          {importing ? (
            <div style={{ marginTop: 12 }}>
              <input
                className="field mono"
                placeholder="0x… private key"
                value={importValue}
                onChange={(e) => setImportValue(e.target.value)}
              />
              <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={doImport}>
                Import and switch on
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="between" style={{ marginBottom: 12 }}>
            <div>
              <span className="label">Address</span>
              <div className="mono" style={{ fontSize: "0.84rem", marginTop: 4 }}>
                {address ? shortAddress(address, 10, 8) : "—"}
              </div>
            </div>
            {address ? (
              <a className="btn btn-quiet btn-sm" href={explorerAddressUrl(network, address)} target="_blank" rel="noreferrer">
                Explorer ↗
              </a>
            ) : null}
          </div>
          <p className="faint" style={{ fontSize: "0.8rem", margin: "0 0 12px" }}>
            {accountSponsors(network)
              ? `Fees are sponsored on ${network.name} — settling costs nothing beyond the amounts owed.`
              : `Fees are paid in the settlement token on ${network.name}.`}
          </p>
          <div className="row wrap" style={{ gap: 10, alignItems: "center" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setAccountOn(!enabled)}>
              {enabled ? "Switch off (use my wallet)" : "Switch on as signer"}
            </button>
            {network.faucetUrl ? (
              <a className="btn btn-quiet btn-sm" href={network.faucetUrl} target="_blank" rel="noreferrer">
                Fund from faucet ↗
              </a>
            ) : null}
            <button className="btn btn-quiet btn-sm" onClick={() => setRevealed(storedKey())}>
              Export key
            </button>
            <button className="btn btn-quiet btn-sm" style={{ color: "var(--neg)" }} onClick={forget}>
              Forget
            </button>
          </div>
          {revealed ? (
            <div style={{ marginTop: 12 }}>
              <span className="label">Private key — copy it somewhere safe, then hide</span>
              <p className="mono" style={{ margin: "6px 0 0", wordBreak: "break-all", fontSize: "0.8rem" }}>
                {revealed}
              </p>
              <button className="btn btn-quiet btn-sm" style={{ padding: "4px 0" }} onClick={() => setRevealed(null)}>
                Hide
              </button>
            </div>
          ) : null}
        </>
      )}
      {error ? <p style={{ color: "var(--neg)", marginTop: 12, fontSize: "0.86rem" }}>{error}</p> : null}
    </div>
  );
}
