import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Layout } from '../components/Layout.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { Button } from '../components/ui.js';
import { useToast } from '../components/Toast.js';
import { useConfirm } from '../components/ConfirmDialog.js';
import { ServerDetailProvider, useServerDetail } from './server/ServerContext.js';
import { ConsoleTab } from './server/ConsoleTab.js';
import { PlayersTab } from './server/PlayersTab.js';
import { OperatorTab } from './server/OperatorTab.js';
import { WhitelistTab } from './server/WhitelistTab.js';
import { PluginsTab } from './server/PluginsTab.js';
import { SettingsTab } from './server/SettingsTab.js';
import { FilesTab } from './server/FilesTab.js';
import { BackupsTab } from './server/BackupsTab.js';
import { ResourcesTab } from './server/ResourcesTab.js';
import { UpdateTab } from './server/UpdateTab.js';
import { api, ApiError } from '../api/client.js';
import { useAuth } from '../state/AuthContext.js';
import { PLUGIN_CAPABLE_LOADERS } from '../api/types.js';

const PLATFORM_ICON: Record<string, string> = { java: '☕', bedrock: '🪨' };

function ServerPageInner() {
  const { server, running } = useServerDetail();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const location = useLocation();

  async function deleteServer() {
    if (!server) return;
    const ok = await confirm({
      title: 'Delete server',
      message: `Permanently delete "${server.name}"? All server files and backups will be removed. This cannot be undone.`,
      confirmLabel: 'Delete server',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/servers/${server.id}`);
      toast.success(`Deleted "${server.name}"`);
      navigate('/');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete server');
    }
  }

  const tabs = [
    { to: 'console', label: 'Console' },
    { to: 'players', label: 'Players' },
    { to: 'operator', label: 'Operator' },
    { to: 'whitelist', label: 'Whitelist' },
    ...(server && PLUGIN_CAPABLE_LOADERS.includes(server.loader) ? [{ to: 'plugins', label: 'Plugins' }] : []),
    { to: 'settings', label: 'Settings' },
    { to: 'files', label: 'Files' },
    { to: 'backups', label: 'Backups' },
    { to: 'resources', label: 'Resources' },
    { to: 'update', label: 'Update' },
  ];

  if (!server) {
    return (
      <Layout>
        <div className="flex h-screen items-center justify-center">
          <motion.div
            className="h-8 w-8 rounded-lg bg-accent-500 shadow-glow"
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex h-screen flex-col">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass border-b border-surface-700/80 px-6 py-4"
        >
          <div className="mb-1 flex items-center gap-3">
            <Button variant="ghost" className="!px-2" onClick={() => navigate('/')}>
              ←
            </Button>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-800 text-base border border-surface-700">
              {PLATFORM_ICON[server.platform]}
            </div>
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
          <nav className="relative flex flex-wrap gap-1">
            {tabs.map((t) => (
              <NavLink key={t.to} to={t.to} className="relative rounded-lg px-3 py-1.5 text-sm font-medium">
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="server-tab-active"
                        className="absolute inset-0 rounded-lg bg-surface-800"
                        transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                      />
                    )}
                    <span className={`relative z-10 ${isActive ? 'text-accent-400' : 'text-slate-400 hover:text-slate-200'}`}>
                      {t.label}
                    </span>
                    {isActive && (
                      <motion.span
                        layoutId="server-tab-underline"
                        className="absolute -bottom-[13px] left-2 right-2 h-0.5 rounded-full bg-accent-500"
                        transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                      />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </motion.div>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex-1 overflow-y-auto bg-surface-950 px-6 py-5"
        >
          <Routes>
            <Route index element={<Navigate to="console" replace />} />
            <Route path="console" element={<ConsoleTab />} />
            <Route path="players" element={<PlayersTab />} />
            <Route path="operator" element={<OperatorTab />} />
            <Route path="whitelist" element={<WhitelistTab />} />
            {PLUGIN_CAPABLE_LOADERS.includes(server.loader) && <Route path="plugins" element={<PluginsTab />} />}
            <Route path="settings" element={<SettingsTab />} />
            <Route path="files" element={<FilesTab />} />
            <Route path="backups" element={<BackupsTab />} />
            <Route path="resources" element={<ResourcesTab />} />
            <Route path="update" element={<UpdateTab />} />
          </Routes>
        </motion.div>
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
