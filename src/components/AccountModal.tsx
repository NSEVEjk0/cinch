"use client";

/**
 * AccountModal — sign up for, or log in to, the self-custodial Cinch account.
 *
 * Cinch is its own wallet. New users get a 12-word recovery phrase (and the
 * underlying key) shown once, to save; returning users paste a phrase or key to
 * log back in. There is no connect-a-wallet step and nothing is held on a
 * server — the account lives in this browser and is recovered from the phrase.
 */

import { useState } from "react";
import {
  createAccount,
  importMnemonic,
  importAccount,
  accountAddress,
} from "@/lib/cinchAccount";
import { shortAddress } from "@/lib/money";

type Mode = "choose" | "created" | "login";

export function AccountModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("choose");
  const [mnemonic, setMnemonic] = useState<string>("");
  const [key, setKey] = useState<string>("");
  const [loginValue, setLoginValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [copied, setCopied] = useState<"phrase" | "key" | null>(null);

  function doCreate() {
    setError(null);
    const { key: k, mnemonic: m } = createAccount();
    setMnemonic(m);
    setKey(k);
    setMode("created");
  }

  function doLogin() {
    setError(null);
    const v = loginValue.trim();
    try {
      if (/^0x[0-9a-fA-F]{64}$/.test(v)) importAccount(v);
      else importMnemonic(v);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not log in with that.");
    }
  }

  async function copy(text: string, which: "phrase" | "key") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="modal-backdrop" onClick={mode === "created" ? undefined : onClose}>
      <div
        className="modal card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Your Cinch account"
        style={{ maxWidth: 460 }}
      >
        <div className="between" style={{ marginBottom: 6 }}>
          <h2 className="display" style={{ fontSize: "1.35rem", margin: 0 }}>
            {mode === "created" ? "Save your recovery phrase" : "Your Cinch account"}
          </h2>
          {mode !== "created" ? (
            <button className="btn btn-quiet btn-sm" style={{ padding: 6 }} onClick={onClose} aria-label="Close">
              ✕
            </button>
          ) : null}
        </div>

        {mode === "choose" ? (
          <ChooseView onCreate={doCreate} onLogin={() => setMode("login")} />
        ) : null}

        {mode === "created" ? (
          <CreatedView
            mnemonic={mnemonic}
            privateKey={key}
            copied={copied}
            onCopy={copy}
            savedConfirmed={savedConfirmed}
            setSavedConfirmed={setSavedConfirmed}
            onDone={onClose}
          />
        ) : null}

        {mode === "login" ? (
          <LoginView
            value={loginValue}
            setValue={setLoginValue}
            error={error}
            onBack={() => {
              setMode("choose");
              setError(null);
            }}
            onLogin={doLogin}
          />
        ) : null}
      </div>
    </div>
  );
}

function ChooseView({ onCreate, onLogin }: { onCreate: () => void; onLogin: () => void }) {
  return (
    <>
      <p className="faint" style={{ fontSize: "0.88rem", margin: "0 0 20px", lineHeight: 1.55 }}>
        Cinch is its own self-custodial wallet on Tempo — no extension to install. Create an account
        and you&apos;ll get a recovery phrase to log back in anywhere. Nothing is held on a server.
      </p>
      <div className="stack" style={{ gap: 10 }}>
        <button className="btn btn-primary" onClick={onCreate}>
          Create a new account
        </button>
        <button className="btn btn-ghost" onClick={onLogin}>
          Log in with a recovery phrase
        </button>
      </div>
      <p className="faint" style={{ fontSize: "0.76rem", marginTop: 18, marginBottom: 0 }}>
        The key is stored in this browser, unencrypted — a testnet convenience. Keep your recovery
        phrase somewhere safe; it is the only way back in.
      </p>
    </>
  );
}

function CreatedView({
  mnemonic,
  privateKey,
  copied,
  onCopy,
  savedConfirmed,
  setSavedConfirmed,
  onDone,
}: {
  mnemonic: string;
  privateKey: string;
  copied: "phrase" | "key" | null;
  onCopy: (text: string, which: "phrase" | "key") => void;
  savedConfirmed: boolean;
  setSavedConfirmed: (v: boolean) => void;
  onDone: () => void;
}) {
  const [showKey, setShowKey] = useState(false);
  const words = mnemonic.split(" ");
  const address = accountAddress();
  return (
    <>
      <div
        style={{
          padding: 12,
          borderRadius: "var(--r-xs)",
          border: "1px solid var(--accent-line)",
          background: "var(--accent-glow)",
          marginBottom: 16,
        }}
      >
        <p className="faint" style={{ margin: 0, fontSize: "0.82rem", lineHeight: 1.5, color: "var(--text-2)" }}>
          ⚠ Write these 12 words down in order and keep them private. Anyone with them controls this
          account, and Cinch cannot recover them for you.
        </p>
      </div>

      <span className="label">Recovery phrase</span>
      <div
        className="g2"
        style={{ gap: 7, gridTemplateColumns: "repeat(3, minmax(0,1fr))", margin: "8px 0 12px" }}
      >
        {words.map((w, i) => (
          <div
            key={i}
            className="mono"
            style={{
              fontSize: "0.82rem",
              padding: "7px 10px",
              borderRadius: 7,
              border: "1px solid var(--hairline)",
              background: "var(--surface-2)",
            }}
          >
            <span className="faint" style={{ marginRight: 6 }}>{i + 1}</span>
            {w}
          </div>
        ))}
      </div>
      <div className="row" style={{ gap: 10, marginBottom: 14 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => onCopy(mnemonic, "phrase")}>
          {copied === "phrase" ? "Copied ✓" : "Copy phrase"}
        </button>
        <button className="btn btn-quiet btn-sm" onClick={() => setShowKey((v) => !v)}>
          {showKey ? "Hide private key" : "Show private key"}
        </button>
      </div>

      {showKey ? (
        <div style={{ marginBottom: 14 }}>
          <span className="label">Private key</span>
          <p className="mono" style={{ margin: "6px 0 8px", wordBreak: "break-all", fontSize: "0.78rem" }}>
            {privateKey}
          </p>
          <button className="btn btn-quiet btn-sm" style={{ padding: 0 }} onClick={() => onCopy(privateKey, "key")}>
            {copied === "key" ? "Copied ✓" : "Copy key"}
          </button>
        </div>
      ) : null}

      {address ? (
        <p className="faint" style={{ fontSize: "0.8rem", margin: "0 0 16px" }}>
          Your address: <span className="mono">{shortAddress(address, 10, 8)}</span>
        </p>
      ) : null}

      <label className="row" style={{ gap: 9, cursor: "pointer", marginBottom: 14, alignItems: "flex-start" }}>
        <input
          type="checkbox"
          checked={savedConfirmed}
          onChange={(e) => setSavedConfirmed(e.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span style={{ fontSize: "0.86rem", color: "var(--text-2)" }}>
          I&apos;ve saved my recovery phrase somewhere safe.
        </span>
      </label>
      <button className="btn btn-primary" style={{ width: "100%" }} disabled={!savedConfirmed} onClick={onDone}>
        Enter Cinch →
      </button>
    </>
  );
}

function LoginView({
  value,
  setValue,
  error,
  onBack,
  onLogin,
}: {
  value: string;
  setValue: (v: string) => void;
  error: string | null;
  onBack: () => void;
  onLogin: () => void;
}) {
  return (
    <>
      <p className="faint" style={{ fontSize: "0.88rem", margin: "0 0 16px", lineHeight: 1.55 }}>
        Paste your 12- or 24-word recovery phrase (or a <span className="mono">0x…</span> private key)
        to log back into your account.
      </p>
      <textarea
        className="field mono"
        style={{ minHeight: 90, resize: "vertical" }}
        placeholder="apple banana cherry …"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
      />
      {error ? (
        <p style={{ color: "var(--neg)", fontSize: "0.85rem", margin: "10px 0 0" }}>{error}</p>
      ) : null}
      <div className="row" style={{ gap: 10, marginTop: 16 }}>
        <button className="btn btn-primary" onClick={onLogin} disabled={!value.trim()}>
          Log in
        </button>
        <button className="btn btn-quiet btn-sm" onClick={onBack}>
          ← Back
        </button>
      </div>
    </>
  );
}
