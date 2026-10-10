import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../state/AuthContext.js';
import { Badge } from './ui.js';
import { Logo } from './Logo.js';
import { Icon, type IconName } from './icons.js';
import { api } from '../api/client.js';
import type { SystemInfo } from '../api/types.js';

/** One MD3 navigation-drawer item: full-width pill, secondary-container indicator when active. */
export function NavItem({
  to,
  icon,
  label,
  end = false,
  onClick,
}: {
  to: string;
  icon: IconName;
  label: string;
  end?: boolean;
  onClick?: () => void;
}) {
  return (
    <NavLink to={to} end={end} onClick={onClick} className="block">
      {({ isActive }) => (
        <span
          className={`state-layer flex h-12 items-center gap-3 rounded-full px-4 text-sm font-medium transition-colors ${
            isActive ? 'bg-secondary-container text-secondary-on-container' : 'text-ink-300'
          }`}
        >
          <Icon name={icon} className="h-5 w-5" />
          <span className="truncate">{label}</span>
        </span>
      )}
    </NavLink>
  );
}

export function NavSectionLabel({ children }: { children: ReactNode }) {
  return <p className="px-4 pb-1 pt-4 text-xs font-medium text-ink-400">{children}</p>;
}

function MainNav({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  const location = useLocation();
  // The instance list is "/", but it should also read as active nowhere else.
  const onInstances = location.pathname === '/';
  return (
    <nav className="space-y-1">
      <NavLink to="/" end onClick={onNavigate} className="block">
        <span
          className={`state-layer flex h-12 items-center gap-3 rounded-full px-4 text-sm font-medium ${
            onInstances ? 'bg-secondary-container text-secondary-on-container' : 'text-ink-300'
          }`}
        >
          <Icon name="instances" />
          Instances
        </span>
      </NavLink>
      <NavItem to="/configuration" icon="configuration" label="Configuration" onClick={onNavigate} />
      <NavItem to="/files" icon="folder" label="File Management" onClick={onNavigate} />
      {user?.role === 'admin' && <NavItem to="/users" icon="users" label="Users" onClick={onNavigate} />}
    </nav>
  );
}

function DrawerFooter({ system }: { system: SystemInfo | null }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="mt-auto space-y-3 px-1 pt-4">
      <div className="flex items-center gap-3 rounded-2xl bg-surface-850 p-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-container text-sm font-medium text-accent-on-container">
          {user?.username?.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink-100">{user?.username}</p>
          <Badge tone="neutral">{user?.role}</Badge>
        </div>
        <button
          onClick={() => {
            logout();
            navigate('/login');
          }}
          title="Sign out"
          aria-label="Sign out"
          className="state-layer rounded-full p-2 text-ink-300"
        >
          <Icon name="logout" />
        </button>
      </div>
      {system && (
        <p className="truncate px-3 text-[11px] text-ink-500" title={`Node ${system.nodeVersion} on ${system.hostname}`}>
          <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent-400 align-middle" />
          {system.hostname} · {system.platformLabel} {system.arch}
          {system.java.available ? ' · Java' : ''}
        </p>
      )}
    </div>
  );
}

/**
 * App shell: MD3 navigation drawer + content. Pages can replace the drawer's navigation with
 * their own (`sidebar`) — the instance view does, swapping in Status/Console/Backups/….
 */
export function Layout({ children, sidebar }: { children: ReactNode; sidebar?: (close: () => void) => ReactNode }) {
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    api
      .get<SystemInfo>('/system')
      .then(setSystem)
      .catch(() => setSystem(null));
  }, []);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  const close = () => setMobileOpen(false);
  const drawer = (
    <div className="flex h-full flex-col px-3 py-4">
      <div className="mb-4 flex items-center gap-3 px-4 py-2">
        <Logo className="h-8 w-8 shrink-0 rounded-lg" />
        <span className="text-lg font-medium tracking-tight text-ink-50">MultiCraft</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{sidebar ? sidebar(close) : <MainNav onNavigate={close} />}</div>
      <DrawerFooter system={system} />
    </div>
  );

  return (
    <div className="flex h-screen bg-surface-950">
      <aside className="hidden w-72 shrink-0 bg-surface-900 md:block">{drawer}</aside>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div className="fixed inset-0 z-40 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/60" onClick={close} />
            <motion.aside
              className="absolute inset-y-0 left-0 w-72 rounded-r-3xl bg-surface-900"
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
            >
              {drawer}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 bg-surface-900 px-4 py-3 md:hidden">
          <button onClick={() => setMobileOpen(true)} aria-label="Open navigation" className="state-layer rounded-full p-2 text-ink-200">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <Logo className="h-6 w-6 rounded-md" />
          <span className="font-medium text-ink-50">MultiCraft</span>
        </div>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

/** Standard page header for top-level pages. */
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[28px] font-normal leading-9 text-ink-50">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-400">{subtitle}</p>}
      </div>
      {action}
    </motion.div>
  );
}
