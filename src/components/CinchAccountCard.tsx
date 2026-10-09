"use client";

/**
 * AccountCard — the Cinch account, shown in the clearing room.
 *
 * The account is managed from the header, but a circle needs a signer to
 * settle, so this card makes the state obvious right where you clear: who you
 * are, that fees are sponsored, and a faucet link to fund an empty account.
 * Logged out, it prompts you to create an account (the only way to settle).
 */

import { useState } from "react";
import { AccountModal } from "./AccountModal";
import { useCinchAccount } from "@/lib/useSettlement";
import { accountSponsors } from "@/lib/cinchAccount";
import { useNetwork } from "@/lib/useNetwork";
import { shortAddress } from "@/lib/money";
import { explorerAddressUrl } from "@/lib/tempo";

export function CinchAccountCard() {
  const network = useNetwork();
  const { address, hasKey } = useCinchAccount();
  const [modalOpen, setModalOpen] = useState(false);

  if (!hasKey || !address) {
    return (
      <div className="card card-pad">
        <span className="label">Your account</span>
        <p className="faint" style={{ margin: "10px 0 16px", fontSize: "0.88rem", lineHeight: 1.55 }}>
          Cinch is its own self-custodial wallet. Create an account to settle a circle — it signs the
          whole cleared round as one atomic Tempo transaction, with the fee sponsored.
        </p>
        <button className="btn btn-primary btn-sm" onClick={() => setModalOpen(true)}>
          Create or log in →
        </button>
        {modalOpen ? <AccountModal onClose={() => setModalOpen(false)} /> : null}
      </div>
    );
  }

  return (
    <div className="card card-pad">
      <div className="between" style={{ marginBottom: 10 }}>
        <span className="label">Your account</span>
        <span className="chip chip-mint">signer</span>
      </div>
      <div className="between" style={{ marginBottom: 12 }}>
        <div className="mono" style={{ fontSize: "0.84rem" }}>{shortAddress(address, 10, 8)}</div>
        <a className="btn btn-quiet btn-sm" href={explorerAddressUrl(network, address)} target="_blank" rel="noreferrer">
          Explorer ↗
        </a>
      </div>
      <p className="faint" style={{ fontSize: "0.8rem", margin: "0 0 12px" }}>
        {accountSponsors(network)
          ? `Fees are sponsored on ${network.name} — settling costs nothing beyond the amounts owed.`
          : `Fees are paid in the settlement token on ${network.name}.`}
      </p>
      {network.faucetUrl ? (
        <a className="btn btn-ghost btn-sm" href={network.faucetUrl} target="_blank" rel="noreferrer">
          Fund from faucet ↗
        </a>
      ) : null}
    </div>
  );
}
