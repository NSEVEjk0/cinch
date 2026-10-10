// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * CinchClearing — trustless multilateral settlement for Tempo.
 *
 * The netting engine reduces a tangle of debts to a minimal set of transfers:
 * each net debtor pays each net creditor. The hard part is moving funds that
 * belong to several independent parties in ONE atomic step, with nobody going
 * first. A single-signer 0x76 batch can't: it only spends the sender's account.
 *
 * This contract does. Every net debtor authorizes, by signature, the EXACT
 * cleared leg set for a round (nothing goes on-chain, no gas, no funds move).
 * Then anyone — typically the circle's organiser — submits one `clear()` call
 * that pulls each leg straight from debtor to creditor via TIP-20
 * `transferFromWithMemo`. Either every leg settles or the whole transaction
 * reverts. The contract never custodies a cent.
 *
 * Authorization is bound to the hash of the whole ordered leg set, so no amount
 * and no recipient can be altered after signing without invalidating every
 * signature. Allowance comes from EIP-2612 `permit`, so a debtor's only action
 * is to sign — there is no separate on-chain approval.
 */

interface ITIP20 {
    /// Pull `amount` from `from` to `to`, stamping the obligation memo on-chain.
    function transferFromWithMemo(address from, address to, uint256 amount, bytes32 memo)
        external
        returns (bool);
}

interface IERC20Permit {
    /// EIP-2612: set `owner`→`spender` allowance from a signature (no on-chain approve).
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

contract CinchClearing {
    /// One cleared transfer: `from` pays `to` `amount` of `token`, memo stamped on-chain.
    struct Leg {
        address token;
        address from;
        address to;
        uint256 amount;
        bytes32 memo;
    }

    /// An EIP-2612 permit a debtor signed to grant this contract its allowance.
    struct Permit {
        address token;
        address owner;
        uint256 value;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    /// A round can be settled at most once.
    mapping(bytes32 => bool) public cleared;

    bytes32 public immutable DOMAIN_SEPARATOR;

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant AUTHORIZATION_TYPEHASH =
        keccak256("Authorization(bytes32 roundId,bytes32 legsHash)");

    event Cleared(bytes32 indexed roundId, uint256 legCount);
    event LegCleared(bytes32 indexed roundId, address indexed token, address indexed from, address to, uint256 amount, bytes32 memo);

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes("Cinch")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    /**
     * Settle a cleared round atomically.
     *
     * @param roundId Unique id for this settlement (keccak of circle id + legs hash).
     * @param legs    The minimal transfer set; order is part of the signed commitment.
     * @param permits One EIP-2612 permit per (debtor, token) granting allowance.
     *                Applied best-effort — a debtor who already has allowance can omit it.
     * @param auths   One 65-byte EIP-712 signature per distinct debtor over
     *                Authorization(roundId, legsHash). Order is free; every `from`
     *                in `legs` must be covered by one of them.
     */
    function clear(
        bytes32 roundId,
        Leg[] calldata legs,
        Permit[] calldata permits,
        bytes[] calldata auths
    ) external {
        require(!cleared[roundId], "round already cleared");
        require(legs.length > 0, "no legs");

        // The commitment every debtor signed: this exact round and leg set.
        bytes32 legsHash = keccak256(abi.encode(roundId, legs));
        bytes32 digest = _authorizationDigest(roundId, legsHash);

        // Recover the signer of every authorization.
        address[] memory signers = new address[](auths.length);
        for (uint256 i = 0; i < auths.length; i++) {
            signers[i] = _recover(digest, auths[i]);
        }

        // Every payer must have authorized this exact settlement.
        for (uint256 j = 0; j < legs.length; j++) {
            require(_contains(signers, legs[j].from), "payer not authorized");
        }

        // Grant allowance from each permit. Best-effort: a debtor who already
        // approved can skip the permit, and transferFromWithMemo still enforces
        // the real allowance below.
        for (uint256 k = 0; k < permits.length; k++) {
            Permit calldata p = permits[k];
            try IERC20Permit(p.token).permit(p.owner, address(this), p.value, p.deadline, p.v, p.r, p.s) {} catch {}
        }

        // Pull every leg. Any failure reverts the whole settlement — all or nothing.
        for (uint256 m = 0; m < legs.length; m++) {
            Leg calldata leg = legs[m];
            require(
                ITIP20(leg.token).transferFromWithMemo(leg.from, leg.to, leg.amount, leg.memo),
                "leg transfer failed"
            );
            emit LegCleared(roundId, leg.token, leg.from, leg.to, leg.amount, leg.memo);
        }

        cleared[roundId] = true;
        emit Cleared(roundId, legs.length);
    }

    /* ----------------------------- views (for tests/clients) ---------------------------- */

    /// The hash a round's debtors sign — recomputed exactly as `clear` does.
    function computeLegsHash(bytes32 roundId, Leg[] calldata legs) external pure returns (bytes32) {
        return keccak256(abi.encode(roundId, legs));
    }

    /// The full EIP-712 digest for an Authorization, for client cross-checks.
    function authorizationDigest(bytes32 roundId, bytes32 legsHash) external view returns (bytes32) {
        return _authorizationDigest(roundId, legsHash);
    }

    /* --------------------------------- internals --------------------------------- */

    function _authorizationDigest(bytes32 roundId, bytes32 legsHash) internal view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(AUTHORIZATION_TYPEHASH, roundId, legsHash));
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
    }

    /// Recover the signer of a 65-byte (r,s,v) signature.
    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "bad signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        // Reject malleable high-s values (EIP-2).
        require(uint256(s) <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0, "bad s");
        address signer = ecrecover(digest, v, r, s);
        require(signer != address(0), "bad signature");
        return signer;
    }

    function _contains(address[] memory set, address who) internal pure returns (bool) {
        for (uint256 i = 0; i < set.length; i++) {
            if (set[i] == who) return true;
        }
        return false;
    }
}
