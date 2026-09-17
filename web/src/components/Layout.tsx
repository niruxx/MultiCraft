import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../state/AuthContext.js';
import { Badge } from './ui.js';
import { api } from '../api/client.js';
import type { SystemInfo } from '../api/types.js';

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [system, setSystem] = useState<SystemInfo | null>(null);

  useEffect(() => {
    api
      .get<SystemInfo>('/system')
      .then(setSystem)
      .catch(() => setSystem(null));
  }, []);

  return (
    <div className="flex min-h-screen bg-surface-950">
      <aside className="glass relative flex w-56 shrink-0 flex-col border-r border-surface-700/80">
        <div className="flex items-center gap-2.5 px-4 py-5">
          <motion.div
            className="relative h-8 w-8 shrink-0 rounded-lg bg-brand-gradient bg-[length:200%_auto] shadow-glow"
            animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          />
          <span className="text-[15px] font-bold tracking-tight text-white">MultiCraft</span>
        </div>
        <nav className="flex-1 space-y-0.5 px-2.5">
          <SidebarLink to="/" active={location.pathname === '/'}>
            <span>Servers</span>
          </SidebarLink>
          {user?.role === 'admin' && (
            <SidebarLink to="/users" active={location.pathname.startsWith('/users')}>
              <span>Users</span>
            </SidebarLink>
          )}
        </nav>
        <div className="border-t border-surface-700/80 px-3 py-3">
          <div className="mb-2.5 flex items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-400/30 to-brand-to/30 text-xs font-semibold text-accent-400 ring-1 ring-inset ring-accent-500/25">
              {user?.username?.slice(0, 1).toUpperCase()}
            </div>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-200">{user?.username}</span>
            <Badge tone="neutral">{user?.role}</Badge>
          </div>
          <motion.button
            whileHover={{ x: 2 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="w-full rounded-lg bg-surface-800/80 px-3 py-1.5 text-left text-sm text-slate-400 transition-colors hover:bg-surface-700 hover:text-slate-200"
          >
            Sign out
          </motion.button>
          {system && (
            <p
              className="mt-2.5 truncate text-[11px] text-slate-500"
              title={`Node ${system.nodeVersion} on ${system.hostname}`}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-500/70 align-middle mr-1.5" />
              {system.platformLabel} · {system.arch}
              {system.java.available ? ' · Java detected' : ' · Java not found'}
            </p>
          )}
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

function SidebarLink({ to, active, children }: { to: string; active: boolean; children: ReactNode }) {
  return (
    <Link to={to} className="relative block rounded-lg px-3 py-2 text-sm font-medium">
      {active && (
        <motion.span
          layoutId="sidebar-active-pill"
          className="absolute inset-0 rounded-lg bg-accent-500/12 ring-1 ring-inset ring-accent-500/25"
          transition={{ type: 'spring', stiffness: 500, damping: 38 }}
        />
      )}
      <span className={`relative z-10 transition-colors ${active ? 'text-accent-400' : 'text-slate-400 hover:text-slate-200'}`}>
        {children}
      </span>
    </Link>
  );
}
