"use client";

/**
 * TokenSwitch — choose the settlement currency for a circle.
 *
 * Lists the active network's stablecoins and lets the user add a custom token
 * by address (symbol + decimals), so a circle can settle in whatever stablecoin
 * its members use. The choice is the circle's `defaultToken`; changing it
 * re-denominates new obligations.
 */

import { useState } from "react";
import type { Token } from "@/lib/types";
import { useNetwork } from "@/lib/useNetwork";
import { isAddress, shortAddress } from "@/lib/money";

export function TokenSwitch({
  value,
  onChange,
}: {
  value: Token;
  onChange: (token: Token) => void;
}) {
  const network = useNetwork();
  const [adding, setAdding] = useState(false);
  const [addr, setAddr] = useState("");
  const [symbol, setSymbol] = useState("");
  const [decimals, setDecimals] = useState("6");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // The network's tokens, plus the current value if it is a custom one.
  const known = network.tokens;
  const isKnown = known.some((t) => t.address.toLowerCase() === value.address.toLowerCase());
  const options = isKnown ? known : [...known, value];

  function addCustom() {
    setError(null);
    if (!isAddress(addr.trim())) return setError("Enter a valid 0x token address.");
    if (!symbol.trim()) return setError("Give the token a symbol.");
    const d = Number(decimals);
    if (!Number.isInteger(d) || d < 0 || d > 36) return setError("Decimals must be 0–36.");
    onChange({ address: addr.trim() as `0x${string}`, symbol: symbol.trim(), decimals: d });
    setAdding(false);
    setAddr("");
    setSymbol("");
    setDecimals("6");
    setOpen(false);
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        className="btn btn-ghost btn-sm mono"
        onClick={() => setOpen((v) => !v)}
        style={{ gap: 8 }}
        title="Settlement currency"
      >
        <span className="dot" />
        {value.symbol}
        <span style={{ opacity: 0.5, fontSize: "0.7rem" }}>▾</span>
      </button>

      {open ? (
        <div
          className="card"
          style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", padding: 6, minWidth: 240, zIndex: 40 }}
        >
          <div className="label" style={{ padding: "8px 12px 6px" }}>
            Settlement currency
          </div>
          {options.map((t) => (
            <button
              key={t.address}
              className="btn btn-quiet btn-sm"
              style={{ width: "100%", justifyContent: "space-between" }}
              onClick={() => {
                onChange(t);
                setOpen(false);
              }}
            >
              <span className="row" style={{ gap: 8 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background:
                      t.address.toLowerCase() === value.address.toLowerCase()
                        ? "var(--mint-400)"
                        : "var(--line-strong)",
                  }}
                />
                {t.symbol}
              </span>
              <span className="faint mono" style={{ fontSize: "0.72rem" }}>
                {shortAddress(t.address, 6, 4)}
              </span>
            </button>
          ))}

          <div className="hairline" style={{ margin: "6px 0" }} />

          {!adding ? (
            <button
              className="btn btn-quiet btn-sm"
              style={{ width: "100%", justifyContent: "flex-start", color: "var(--mint-400)" }}
              onClick={() => setAdding(true)}
            >
              + Add a custom token
            </button>
          ) : (
            <div style={{ padding: "8px 10px" }}>
              <input
                className="field mono"
                placeholder="0x… token address"
                value={addr}
                onChange={(e) => setAddr(e.target.value)}
                style={{ marginTop: 0 }}
              />
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <input
                  className="field"
                  placeholder="Symbol"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  style={{ marginTop: 0 }}
                />
                <input
                  className="field mono"
                  placeholder="Dec"
                  value={decimals}
                  onChange={(e) => setDecimals(e.target.value)}
                  style={{ marginTop: 0, maxWidth: 70 }}
                />
              </div>
              {error ? (
                <p style={{ color: "var(--rose-400)", fontSize: "0.8rem", margin: "8px 0 0" }}>{error}</p>
              ) : null}
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                <button className="btn btn-primary btn-sm" onClick={addCustom}>
                  Add
                </button>
                <button className="btn btn-quiet btn-sm" onClick={() => setAdding(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
