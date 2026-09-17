/**
 * The MultiCraft mark: three blocks on a dark tile, matching public/favicon.svg exactly so
 * the browser tab icon and every in-app logo chip (sidebar, login, setup, loading states)
 * are the same glyph. Colors are fixed (not theme-aware) — a brand mark, unlike UI chrome,
 * shouldn't repaint when the user switches light/dark.
 */
export function Logo({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="MultiCraft">
      <rect width="32" height="32" rx="6" fill="#12161b" />
      <rect x="7" y="9" width="6" height="6" fill="#4ade80" />
      <rect x="19" y="9" width="6" height="6" fill="#22c55e" />
      <rect x="13" y="17" width="6" height="6" fill="#4ade80" />
    </svg>
  );
}
