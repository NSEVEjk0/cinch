"use client";

/**
 * BackButton — a consistent, good-looking back control.
 *
 * Prefers real browser history; falls back to a provided href (or /app) when
 * there is nowhere to go back to, so it never dead-ends.
 */

import { useRouter } from "next/navigation";

export function BackButton({
  fallback = "/app",
  label = "Back",
}: {
  fallback?: string;
  label?: string;
}) {
  const router = useRouter();

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallback);
    }
  }

  return (
    <button
      className="btn btn-ghost btn-sm back-btn"
      onClick={goBack}
      aria-label={label}
    >
      <span aria-hidden="true" style={{ fontSize: "1.05em", lineHeight: 1 }}>
        ←
      </span>
      {label}
    </button>
  );
}
