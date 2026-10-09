export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="row" style={{ gap: 10 }}>
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="logoG" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop stopColor="#c67b3e" />
            <stop offset="1" stopColor="#a9693a" />
          </linearGradient>
        </defs>
        <circle cx="16" cy="16" r="10" stroke="url(#logoG)" strokeWidth="2" fill="none" />
        <path
          d="M16 6 A10 10 0 0 1 24.66 21"
          stroke="url(#logoG)"
          strokeWidth="2.6"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="16" cy="6" r="2.6" fill="#c67b3e" />
      </svg>
      <span
        style={{
          fontWeight: 600,
          fontSize: "1.12rem",
          letterSpacing: "-0.02em",
        }}
      >
        Cinch
      </span>
    </span>
  );
}
