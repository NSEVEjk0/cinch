"use client";

/**
 * WalletPanel — the Cinch account as a wallet.
 *
 * One place to see balances across every asset, add a token by address, and
 * send or receive — for the self-custodial Cinch account Cinch generates. (A
 * connected external wallet already has its own send/receive, so this is only
 * for the Cinch account.)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AccountModal } from "./AccountModal";
import { useCinchAccount } from "@/lib/useSettlement";
import { accountSendToken, accountSponsors } from "@/lib/cinchAccount";
import { useNetwork } from "@/lib/useNetwork";
import { readBalance, readTokenMeta } from "@/lib/chain";
import { loadUserTokens, addUserToken, removeUserToken, allTokens } from "@/lib/userTokens";
import { formatAmount, parseAmount, shortAddress, isAddress } from "@/lib/money";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/tempo";
import type { Token } from "@/lib/types";

export function WalletPanel() {
  const network = useNetwork();
  const { key, address, hasKey } = useCinchAccount();
  const [modalOpen, setModalOpen] = useState(false);

  const [userTokens, setUserTokens] = useState<Token[]>([]);
  const tokens = useMemo(() => allTokens(network.key, network.tokens), [network, userTokens]);
  const [balances, setBalances] = useState<Record<string, bigint>>({});
  const [loading, setLoading] = useState(false);

  // load custom tokens for this network
  useEffect(() => {
    setUserTokens(loadUserTokens(network.key));
  }, [network.key]);

  const refresh = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const entries = await Promise.all(
        tokens.map(async (t) => {
          try {
            return [t.address.toLowerCase(), await readBalance(address, t.address, network)] as const;
          } catch {
            return [t.address.toLowerCase(), -1n] as const; // unreadable
          }
        })
      );
      setBalances(Object.fromEntries(entries));
    } finally {
      setLoading(false);
    }
  }, [address, tokens, network]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!hasKey || !address || !key) {
    return (
      <div className="card card-pad">
        <span className="label">Your Cinch wallet</span>
        <p className="faint" style={{ margin: "10px 0 16px", fontSize: "0.9rem", lineHeight: 1.55 }}>
          Create a Cinch account to get a self-custodial Tempo wallet — hold any asset, send and
          receive, and settle circles. It&apos;s a 12-word phrase, no extension.
        </p>
        <button className="btn btn-primary btn-sm" onClick={() => setModalOpen(true)}>
          Create or log in →
        </button>
        {modalOpen ? <AccountModal onClose={() => setModalOpen(false)} /> : null}
      </div>
    );
  }

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <ReceiveHeader address={address} />
      <Balances tokens={tokens} balances={balances} loading={loading} onRefresh={refresh}
        onRemove={(addr) => setUserTokens(removeUserToken(network.key, addr))} builtins={network.tokens} />
      <AddAsset network={network} onAdded={() => setUserTokens(loadUserTokens(network.key))} />
      <SendBox tokens={tokens} walletKey={key} onSent={refresh} />
    </div>
  );
}

/* --------------------------------- receive -------------------------------- */

function ReceiveHeader({ address }: { address: `0x${string}` }) {
  const network = useNetwork();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--hairline)" }}>
      <div className="between" style={{ marginBottom: 10 }}>
        <span className="label">Your wallet</span>
        <span className="chip chip-mint">self-custodial</span>
      </div>
      <div className="between" style={{ gap: 10, alignItems: "center" }}>
        <span className="mono" style={{ fontSize: "0.84rem", minWidth: 0, overflowWrap: "anywhere" }}>
          {shortAddress(address, 12, 10)}
        </span>
        <div className="row" style={{ gap: 6, flexShrink: 0 }}>
          <button className="btn btn-ghost btn-sm" onClick={copy}>
            {copied ? "Copied ✓" : "Copy address"}
          </button>
          <a className="btn btn-quiet btn-sm" href={explorerAddressUrl(network, address)} target="_blank" rel="noreferrer">
            Explorer ↗
          </a>
        </div>
      </div>
      <p className="faint" style={{ fontSize: "0.78rem", margin: "10px 0 0" }}>
        To receive, share this address — any Tempo asset sent to it shows up below.
        {network.faucetUrl ? (
          <>
            {" "}
            <a href={network.faucetUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
              Fund from the faucet ↗
            </a>
          </>
        ) : null}
      </p>
    </div>
  );
}

/* -------------------------------- balances -------------------------------- */

function Balances({
  tokens,
  balances,
  loading,
  onRefresh,
  onRemove,
  builtins,
}: {
  tokens: Token[];
  balances: Record<string, bigint>;
  loading: boolean;
  onRefresh: () => void;
  onRemove: (address: string) => void;
  builtins: Token[];
}) {
  const isBuiltin = (t: Token) => builtins.some((b) => b.address.toLowerCase() === t.address.toLowerCase());
  return (
    <div>
      <div className="between" style={{ padding: "12px 22px", borderBottom: "1px solid var(--hairline)" }}>
        <span className="label">Balances · {tokens.length} asset{tokens.length === 1 ? "" : "s"}</span>
        <button className="btn btn-quiet btn-sm" style={{ padding: 0 }} onClick={onRefresh} disabled={loading}>
          {loading ? "reading…" : "refresh"}
        </button>
      </div>
      <div>
        {tokens.map((t) => {
          const bal = balances[t.address.toLowerCase()];
          const unreadable = bal === -1n;
          return (
            <div key={t.address} className="between" style={{ padding: "12px 22px", borderBottom: "1px solid var(--hairline)", gap: 12 }}>
              <div className="row" style={{ gap: 8, minWidth: 0 }}>
                <span style={{ fontWeight: 540, fontSize: "0.9rem" }}>{t.symbol}</span>
                {!isBuiltin(t) ? (
                  <button
                    className="btn btn-quiet btn-sm"
                    style={{ padding: "0 4px", fontSize: "0.7rem", color: "var(--text-faint)" }}
                    title="Remove this asset from your wallet"
                    onClick={() => onRemove(t.address)}
                  >
                    remove
                  </button>
                ) : null}
              </div>
              <span className="mono tnum" style={{ fontSize: "0.9rem", flexShrink: 0, whiteSpace: "nowrap" }}>
                {bal === undefined ? "…" : unreadable ? "—" : formatAmount(bal, t.decimals)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------- add asset ------------------------------- */

function AddAsset({ network, onAdded }: { network: ReturnType<typeof useNetwork>; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [addr, setAddr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const a = addr.trim();
    if (!isAddress(a)) {
      setError("Enter a valid 0x token contract address.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const meta = await readTokenMeta(a as `0x${string}`, network);
      addUserToken(network.key, { address: a as `0x${string}`, symbol: meta.symbol, decimals: meta.decimals });
      setAddr("");
      setOpen(false);
      onAdded();
    } catch {
      setError("Couldn't read that token — check the address is a TIP-20 on this network.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--hairline)" }}>
      {!open ? (
        <button className="btn btn-quiet btn-sm" style={{ padding: 0, color: "var(--accent)" }} onClick={() => setOpen(true)}>
          + Add an asset by address
        </button>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          <span className="label">Token contract address</span>
          <div className="row" style={{ gap: 8 }}>
            <input
              className="field mono"
              style={{ flex: 1, marginTop: 0 }}
              placeholder="0x…"
              value={addr}
              onChange={(e) => { setAddr(e.target.value); setError(null); }}
              onKeyDown={(e) => e.key === "Enter" && !busy && add()}
            />
            <button className="btn btn-primary btn-sm" onClick={add} disabled={busy || !addr.trim()}>
              {busy ? "Reading…" : "Add"}
            </button>
            <button className="btn btn-quiet btn-sm" onClick={() => { setOpen(false); setAddr(""); setError(null); }}>
              Cancel
            </button>
          </div>
          {error ? <p style={{ color: "var(--rose-400)", fontSize: "0.82rem", margin: 0 }}>{error}</p> : null}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- send ---------------------------------- */

function SendBox({ tokens, walletKey, onSent }: { tokens: Token[]; walletKey: `0x${string}`; onSent: () => void }) {
  const network = useNetwork();
  const [tokenSym, setTokenSym] = useState(tokens[0]?.symbol ?? "");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [txRef, setTxRef] = useState("");
  const [error, setError] = useState<string | null>(null);

  const token = tokens.find((t) => t.symbol === tokenSym) ?? tokens[0];

  async function send() {
    setError(null);
    if (!token) return;
    const dest = to.trim();
    if (!isAddress(dest)) return setError("Enter a valid 0x recipient address.");
    let units: bigint;
    try {
      units = parseAmount(amount, token.decimals);
    } catch {
      return setError("Enter a valid amount.");
    }
    if (units <= 0n) return setError("The amount must be above zero.");
    setStatus("sending");
    try {
      const ref = await accountSendToken(network, walletKey, token, dest as `0x${string}`, units, note);
      setTxRef(ref);
      setStatus("sent");
      setTo("");
      setAmount("");
      setNote("");
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0].slice(0, 180) : "The send failed.");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="card-pad" style={{ padding: "16px 22px" }}>
        <div className="row" style={{ gap: 8, marginBottom: 8 }}>
          <span className="mono" style={{ fontSize: "0.86rem", color: "var(--mint-400)" }}>✓ Sent</span>
        </div>
        {txRef && /^0x[0-9a-fA-F]{64}$/.test(txRef) ? (
          <a className="btn btn-ghost btn-sm" href={explorerTxUrl(network, txRef)} target="_blank" rel="noreferrer">
            View on the Tempo explorer →
          </a>
        ) : null}
        <div>
          <button className="btn btn-quiet btn-sm" style={{ padding: 0, marginTop: 10, color: "var(--accent)" }} onClick={() => setStatus("idle")}>
            Send another →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card-pad" style={{ padding: "16px 22px" }}>
      <span className="label">Send</span>
      <div className="g2" style={{ gap: 10, marginTop: 10 }}>
        <label className="stack">
          <span className="label">Asset</span>
          <select className="field" value={tokenSym} onChange={(e) => setTokenSym(e.target.value)} aria-label="Asset to send">
            {tokens.map((t) => (
              <option key={t.address} value={t.symbol}>{t.symbol}</option>
            ))}
          </select>
        </label>
        <label className="stack">
          <span className="label">Amount</span>
          <input className="field mono" placeholder="100.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
      </div>
      <label className="stack" style={{ marginTop: 10 }}>
        <span className="label">To address</span>
        <input className="field mono" placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value)} />
      </label>
      <label className="stack" style={{ marginTop: 10 }}>
        <span className="label">Note (optional, rides on-chain)</span>
        <input className="field" placeholder="invoice #42" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {error ? <p style={{ color: "var(--rose-400)", fontSize: "0.84rem", margin: "10px 0 0" }}>{error}</p> : null}
      <button className="btn btn-primary" style={{ marginTop: 14, width: "100%" }} onClick={send} disabled={status === "sending" || !amount.trim() || !to.trim()}>
        {status === "sending" ? "Sending on Tempo…" : `Send ${token?.symbol ?? ""}`}
      </button>
      <p className="faint" style={{ fontSize: "0.76rem", marginTop: 10, textAlign: "center" }}>
        {accountSponsors(network) ? "Fee sponsored — nothing leaves beyond the amount you send." : "Fee paid from your balance."}
      </p>
    </div>
  );
}
