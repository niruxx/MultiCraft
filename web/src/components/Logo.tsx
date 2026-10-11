/**
 * The Outpost mark: a watchtower flying a flag on a dark tile — identical to public/favicon.svg
 * so the browser tab and every in-app logo match. Colors are fixed (a brand mark, not UI chrome).
 */
export function Logo({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="Outpost">
      <rect width="32" height="32" rx="6" fill="#12161b" />
      <path d="M16 3.5v7" stroke="#c2c9bb" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M16.6 4l7 2.2-7 2.2z" fill="#4ade80" />
      <rect x="9.5" y="10.5" width="13" height="3" rx="0.8" fill="#4ade80" />
      <path d="M11.2 13.5h9.6l1.7 13H9.5z" fill="#22c55e" />
      <rect x="14.4" y="20" width="3.2" height="6.5" rx="1.6" fill="#0c0f0a" />
      <rect x="12.5" y="15.5" width="2" height="2" fill="#0c0f0a" opacity="0.55" />
      <rect x="17.5" y="15.5" width="2" height="2" fill="#0c0f0a" opacity="0.55" />
    </svg>
  );
}
