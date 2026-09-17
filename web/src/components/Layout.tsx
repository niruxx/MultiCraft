import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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
      <aside className="flex w-56 flex-col border-r border-surface-700 bg-surface-900">
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="h-7 w-7 rounded-md bg-gradient-to-br from-accent-500 to-accent-600" />
          <span className="text-base font-bold tracking-tight text-white">MultiCraft</span>
        </div>
        <nav className="flex-1 space-y-0.5 px-2">
          <SidebarLink to="/" active={location.pathname === '/'}>
            Servers
          </SidebarLink>
          {user?.role === 'admin' && (
            <SidebarLink to="/users" active={location.pathname.startsWith('/users')}>
              Users
            </SidebarLink>
          )}
        </nav>
        <div className="border-t border-surface-700 px-3 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="truncate text-sm font-medium text-slate-200">{user?.username}</span>
            <Badge tone="neutral">{user?.role}</Badge>
          </div>
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="w-full rounded-md bg-surface-800 px-3 py-1.5 text-left text-sm text-slate-400 hover:bg-surface-700 hover:text-slate-200"
          >
            Sign out
          </button>
          {system && (
            <p className="mt-2 truncate text-[11px] text-slate-500" title={`Node ${system.nodeVersion} on ${system.hostname}`}>
              {system.platformLabel} · {system.arch}
              {system.java.available ? ' · Java detected' : ' · Java not found'}
            </p>
          )}
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

function SidebarLink({ to, active, children }: { to: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-accent-600/15 text-accent-500' : 'text-slate-400 hover:bg-surface-800 hover:text-slate-200'
      }`}
    >
      {children}
    </Link>
  );
}
