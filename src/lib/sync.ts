"use client";

/**
 * Live shared circles — optional server sync (client half).
 *
 * A circle can be pushed to the hosted store so everyone who opens its link
 * sees the same room update, instead of each holding a private copy. The
 * payload is the same bigint-safe string used for URL sharing (encodeCircle),
 * so the server stays a dumb key→payload store.
 *
 * Every call degrades gracefully: if the server isn't configured, or the
 * network blips, push/pull resolve to a safe no-op rather than throwing — the
 * app keeps working with its local copy and URL sharing.
 */

import { encodeCircle, decodeCircle, type Circle } from "./circle";

/** Push a circle to the shared store. Returns true if it was stored. */
export async function pushCircle(circle: Circle): Promise<boolean> {
  try {
    const payload = encodeCircle(circle);
    if (!payload) return false;
    const res = await fetch("/api/circle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: circle.id, payload }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Pull a circle from the shared store by id, or null if absent/unavailable. */
export async function pullCircle(id: string): Promise<Circle | null> {
  try {
    const res = await fetch(`/api/circle?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { payload?: string };
    if (!body.payload) return null;
    return decodeCircle(body.payload);
  } catch {
    return null;
  }
}

/** Is server sync available at all? Cached after the first check. */
let configured: boolean | null = null;
export async function syncAvailable(): Promise<boolean> {
  if (configured !== null) return configured;
  try {
    const res = await fetch("/api/circle?id=__probe__", { cache: "no-store" });
    // 503 => not configured; anything else (200/404) => available.
    configured = res.status !== 503;
  } catch {
    configured = false;
  }
  return configured;
}
