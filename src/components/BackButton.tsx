"use client";

/**
 * BackButton — a consistent, good-looking back control.
 *
 * It goes back through browser history only when the previous page was within
 * Cinch (same origin); otherwise — a fresh tab, a shared link opened cold, an
 * external referrer — it navigates to an explicit `fallback` so it never
 * dead-ends or bounces the user off the site.
 */

import { useRouter } from "next/navigation";

export function BackButton({
  fallback = "/app",
  label = "Back",
}: {
  /** Where to go when there is no in-app history to return to. */
  fallback?: string;
  label?: string;
}) {
  const router = useRouter();

  function goBack() {
    if (typeof window === "undefined") {
      router.push(fallback);
      return;
    }
    const ref = document.referrer;
    const cameFromCinch = ref && ref.startsWith(window.location.origin);
    if (cameFromCinch && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallback);
    }
  }

  return (
    <button className="btn btn-ghost btn-sm back-btn" onClick={goBack} aria-label={label}>
      <span aria-hidden="true" style={{ fontSize: "1.05em", lineHeight: 1 }}>
        ←
      </span>
      {label}
    </button>
  );
}
