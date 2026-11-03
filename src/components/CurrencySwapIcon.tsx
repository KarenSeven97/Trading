/** Two overlapping coins and circular exchange arrows, matching the toolbar sketch. */
export function CurrencySwapIcon({ currency }: { currency: "USD" | "CNY" }) {
  const front = currency === "CNY" ? "¥" : "$";
  const back = currency === "CNY" ? "$" : "¥";
  return (
    <svg className="currency-swap-icon" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 8a17 17 0 0 1 23 0M31 4v4h-4M32 32a17 17 0 0 1-23 0M9 36v-4h4" />
        <ellipse cx="26.5" cy="19.5" rx="9" ry="10.5" className="coin-back" />
      </g>
      <text x="28" y="24" textAnchor="middle" fill="currentColor" fontSize="15" fontFamily="Arial, sans-serif">{back}</text>
      <ellipse cx="14" cy="21" rx="10.5" ry="11.5" className="coin-front" stroke="currentColor" strokeWidth="1.65" />
      <text x="14" y="26" textAnchor="middle" fill="var(--blue2)" fontSize="18" fontFamily="Arial, sans-serif">{front}</text>
    </svg>
  );
}
