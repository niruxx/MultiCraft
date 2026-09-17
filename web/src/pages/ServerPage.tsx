import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { Button } from '../components/ui.js';
import { ServerDetailProvider, useServerDetail } from './server/ServerContext.js';
import { ConsoleTab } from './server/ConsoleTab.js';
import { PlayersTab } from './server/PlayersTab.js';
import { SettingsTab } from './server/SettingsTab.js';
import { FilesTab } from './server/FilesTab.js';
import { BackupsTab } from './server/BackupsTab.js';
import { api, ApiError } from '../api/client.js';
import { useAuth } from '../state/AuthContext.js';

const TABS = [
  { to: 'console', label: 'Console' },
  { to: 'players', label: 'Players' },
  { to: 'settings', label: 'Settings' },
  { to: 'files', label: 'Files' },
  { to: 'backups', label: 'Backups' },
];

function ServerPageInner() {
  const { server, running } = useServerDetail();
  const { user } = useAuth();
  const navigate = useNavigate();

  async function deleteServer() {
    if (!server) return;
    if (!window.confirm(`Permanently delete "${server.name}"? All server files and backups will be removed.`)) return;
    try {
      await api.delete(`/servers/${server.id}`);
      navigate('/');
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Failed to delete server');
    }
  }

  if (!server) {
    return (
      <Layout>
        <div className="px-6 py-8 text-sm text-slate-500">Loading server…</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex h-screen flex-col">
        <div className="border-b border-surface-700 px-6 py-4">
          <div className="mb-1 flex items-center gap-3">
            <Button variant="ghost" className="!px-2" onClick={() => navigate('/')}>
              ←
            </Button>
            <h1 className="text-lg font-bold text-white">{server.name}</h1>
            <StatusBadge status={server.status} />
            {user?.role === 'admin' && (
              <Button variant="danger" className="ml-auto" disabled={running} onClick={deleteServer}>
                Delete server
              </Button>
            )}
          </div>
          <p className="mb-3 text-xs text-slate-400">
            {server.platform === 'java' ? 'Java' : 'Bedrock'} · {server.loader} {server.version} · port {server.server_port}
          </p>
          <nav className="flex gap-1">
            {TABS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                className={({ isActive }) =>
                  `rounded-t-md px-3 py-1.5 text-sm font-medium ${
                    isActive ? 'bg-surface-800 text-accent-500' : 'text-slate-400 hover:text-slate-200'
                  }`
                }
              >
                {t.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex-1 overflow-y-auto bg-surface-950 px-6 py-5">
          <Routes>
            <Route index element={<Navigate to="console" replace />} />
            <Route path="console" element={<ConsoleTab />} />
            <Route path="players" element={<PlayersTab />} />
            <Route path="settings" element={<SettingsTab />} />
            <Route path="files" element={<FilesTab />} />
            <Route path="backups" element={<BackupsTab />} />
          </Routes>
        </div>
      </div>
    </Layout>
  );
}

export function ServerPage() {
  return (
    <ServerDetailProvider>
      <ServerPageInner />
    </ServerDetailProvider>
  );
}
