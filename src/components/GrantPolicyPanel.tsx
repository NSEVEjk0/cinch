"use client";

import { useState } from "react";
import type { Hex } from "viem";
import { useSignTypedData } from "wagmi";
import { useIdentity } from "@/lib/useIdentity";
import { useCinchAccount } from "@/lib/useSettlement";
import { signTypedDataWithKey, readPermitContextPublic } from "@/lib/cinchAccount";
import { loadCircles } from "@/lib/circle";
import { useNetwork } from "@/lib/useNetwork";
import { MODERATO, PATH_USD } from "@/lib/tempo";
import { keccak256, encodeAbiParameters, stringToBytes } from "viem";

const CLEARING_ADDRESS = process.env.NEXT_PUBLIC_CINCH_CLEARING_ADDRESS as Hex | undefined;

const STANDING_TYPES = {
  StandingAuthorization: [
    { name: "circleId", type: "bytes32" },
    { name: "policyHash", type: "bytes32" },
  ],
} as const;

const PERMIT_TYPES = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

function standingPolicyHash(policy: { token: Hex; maxNetDebitPerRound: bigint; validUntil: bigint }): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { name: "token", type: "address" },
        { name: "maxNetDebitPerRound", type: "uint256" },
        { name: "validUntil", type: "uint256" },
      ],
      [policy.token, policy.maxNetDebitPerRound, policy.validUntil]
    )
  );
}

type Status = "idle" | "signing" | "submitting" | "done" | "error";

/**
 * Grant the Cinch Agent a standing policy for one of your circles.
 *
 * You sign two things — both off-chain, nothing moves:
 *  1. a standing authorization: "the agent may net me into any round of this
 *     circle up to <cap> pathUSD per round";
 *  2. an EIP-2612 permit granting the clearing contract allowance up to that cap.
 * The agent stores both and can then settle rounds for you without asking again.
 */
export function GrantPolicyPanel() {
  const identity = useIdentity();
  const cinch = useCinchAccount();
  const network = useNetwork();
  const { signTypedDataAsync } = useSignTypedData();

  const circles = loadCircles().filter((c) => c.obligations.length > 0);
  const [circleId, setCircleId] = useState("");
  const [cap, setCap] = useState("25");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function grant() {
    if (!identity.address) {
      setStatus("error");
      setMessage("Connect a wallet or create a Cinch account first.");
      return;
    }
    if (!CLEARING_ADDRESS) {
      setStatus("error");
      setMessage("Clearing contract not configured on this deployment.");
      return;
    }
    const circle = circles.find((c) => c.id === circleId);
    if (!circle) {
      setStatus("error");
      setMessage("Pick a circle.");
      return;
    }
    const capNum = Number(cap);
    if (!Number.isFinite(capNum) || capNum <= 0) {
      setStatus("error");
      setMessage("Cap must be a positive number of pathUSD.");
      return;
    }

    setStatus("signing");
    setMessage("");
    try {
      const circleKey = keccak256(stringToBytes(`cinch:${circle.id}`));
      const capBig = BigInt(Math.round(capNum * 1e6));
      const policy = { token: PATH_USD.address as Hex, maxNetDebitPerRound: capBig, validUntil: 0n };
      const policyHash = standingPolicyHash(policy);

      const sign = (td: Parameters<typeof signTypedDataWithKey>[1]) =>
        cinch.key ? signTypedDataWithKey(cinch.key, td) : signTypedDataAsync(td as never);

      // 1. Standing authorization
      const standingSig = await sign({
        domain: { name: "Cinch", version: "1", chainId: network.chainId, verifyingContract: CLEARING_ADDRESS },
        types: STANDING_TYPES,
        primaryType: "StandingAuthorization",
        message: { circleId: circleKey, policyHash },
      });
      const raw1 = standingSig.slice(2);
      const standingAuth = {
        circleId: circleKey,
        policy,
        v: parseInt(raw1.slice(128, 130), 16) < 27 ? parseInt(raw1.slice(128, 130), 16) + 27 : parseInt(raw1.slice(128, 130), 16),
        r: ("0x" + raw1.slice(0, 64)) as Hex,
        s: ("0x" + raw1.slice(64, 128)) as Hex,
      };

      // 2. Permit (allowance up to cap)
      const ctx = await readPermitContextPublic(network, PATH_USD.address as Hex, identity.address);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600 * 24 * 30);
      const permitSig = await sign({
        domain: { name: ctx.tokenName, version: ctx.version, chainId: network.chainId, verifyingContract: PATH_USD.address },
        types: PERMIT_TYPES,
        primaryType: "Permit",
        message: { owner: identity.address, spender: CLEARING_ADDRESS, value: capBig, nonce: ctx.nonce, deadline },
      });
      const raw2 = permitSig.slice(2);
      const permit = {
        token: PATH_USD.address as Hex,
        owner: identity.address,
        value: capBig,
        deadline,
        v: parseInt(raw2.slice(128, 130), 16) < 27 ? parseInt(raw2.slice(128, 130), 16) + 27 : parseInt(raw2.slice(128, 130), 16),
        r: ("0x" + raw2.slice(0, 64)) as Hex,
        s: ("0x" + raw2.slice(64, 128)) as Hex,
      };

      // 3. Submit to the agent (via same-origin proxy). BigInts → strings for JSON.
      setStatus("submitting");
      const wire = (v: bigint) => v.toString();
      const res = await fetch("/api/agent/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          circleId: circle.id,
          payer: identity.address,
          standingAuth: {
            circleId: standingAuth.circleId,
            policy: {
              token: standingAuth.policy.token,
              maxNetDebitPerRound: wire(standingAuth.policy.maxNetDebitPerRound),
              validUntil: wire(standingAuth.policy.validUntil),
            },
            v: standingAuth.v,
            r: standingAuth.r,
            s: standingAuth.s,
          },
          permit: {
            token: permit.token,
            owner: permit.owner,
            value: wire(permit.value),
            deadline: wire(permit.deadline),
            v: permit.v,
            r: permit.r,
            s: permit.s,
          },
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "store failed");

      setStatus("done");
      setMessage(`Policy granted: the agent may settle ${circle.name} for you up to ${cap} pathUSD per round.`);
    } catch (e) {
      setStatus("error");
      setMessage(String(e instanceof Error ? e.message : e));
    }
  }

  return (
    <div className="card card-pad" style={{ padding: 28 }}>
      <p className="eyebrow" style={{ marginBottom: 12 }}>
        Grant the agent a policy
      </p>
      <h3 className="display" style={{ fontSize: "1.2rem", marginBottom: 8 }}>
        Let the agent settle your circle without asking each time
      </h3>
      <p className="muted" style={{ fontSize: "0.92rem", lineHeight: 1.6, maxWidth: "60ch" }}>
        You sign one standing authorization (a cap, not custody) and one permit. From then on the
        agent can net you into any round of this circle up to that cap — atomically, on Tempo.
      </p>

      {!identity.enabled && (
        <div style={{ padding: 14, borderRadius: "var(--r-md)", background: "var(--danger-weak)", color: "var(--danger)", fontSize: "0.9rem", marginTop: 16 }}>
          Connect a wallet or create a Cinch account to grant a policy.
        </div>
      )}

      {identity.enabled && (
        <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span className="mono" style={{ fontSize: "0.78rem", color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Circle
            </span>
            <select
              value={circleId}
              onChange={(e) => setCircleId(e.target.value)}
              className="input"
              style={{ padding: "10px 12px", borderRadius: "var(--r-md)", border: "1px solid var(--hairline)", background: "var(--surface)", color: "var(--text-1)" }}
            >
              <option value="">Select a circle…</option>
              {circles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.obligations.length} obligations)
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span className="mono" style={{ fontSize: "0.78rem", color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Max net debit per round (pathUSD)
            </span>
            <input
              type="number"
              min="1"
              value={cap}
              onChange={(e) => setCap(e.target.value)}
              className="input"
              style={{ padding: "10px 12px", borderRadius: "var(--r-md)", border: "1px solid var(--hairline)", background: "var(--surface)", color: "var(--text-1)" }}
            />
          </label>

          <button onClick={grant} disabled={status === "signing" || status === "submitting"} className="btn btn-primary">
            {status === "signing" ? "Signing…" : status === "submitting" ? "Submitting…" : "Sign & grant policy"}
          </button>

          {status === "done" && message && (
            <div style={{ padding: 14, borderRadius: "var(--r-md)", background: "var(--pos-weak)", color: "var(--pos)", fontSize: "0.92rem" }}>
              {message}
            </div>
          )}
          {status === "error" && message && (
            <div style={{ padding: 14, borderRadius: "var(--r-md)", background: "var(--danger-weak)", color: "var(--danger)", fontSize: "0.92rem" }}>
              {message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
