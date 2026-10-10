import { useEffect, useState } from 'react';
import { Layout, PageHeader } from '../components/Layout.js';
import { Badge, Button, Card, ErrorText, Field, Input, Modal, Select } from '../components/ui.js';
import { useToast } from '../components/Toast.js';
import { useConfirm } from '../components/ConfirmDialog.js';
import { api, ApiError } from '../api/client.js';
import type { PublicUser, Role, ServerPermission, ServerRecord } from '../api/types.js';
import { GameTile, gameKindOf } from '../components/GameArt.js';
import { useAuth } from '../state/AuthContext.js';

export function UsersPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [users, setUsers] = useState<PublicUser[] | null>(null);
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<PublicUser | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  async function load() {
    try {
      const [usersRes, serversRes] = await Promise.all([
        api.get<{ users: PublicUser[] }>('/users'),
        api.get<{ servers: ServerRecord[] }>('/servers'),
      ]);
      setUsers(usersRes.users);
      setServers(serversRes.servers);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to load users');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function deleteUser(user: PublicUser) {
    const ok = await confirm({
      title: 'Delete user',
      message: `Delete user "${user.username}"? This cannot be undone.`,
      confirmLabel: 'Delete user',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/users/${user.id}`);
      toast.success(`Deleted "${user.username}"`);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete user');
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
        <PageHeader
          title="Users"
          subtitle="Manage panel accounts and per-instance access."
          action={
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              + New user
            </Button>
          }
        />

        {users === null ? (
          <p className="text-sm text-ink-500">Loading…</p>
        ) : (
          <Card className="divide-y divide-surface-800">
            {users.map((u, i) => (
              <div
                key={u.id}
                style={{ animationDelay: `${Math.min(i, 20) * 18}ms` }}
                className="animate-fade-in-up flex items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink-100">{u.username}</span>
                    <Badge tone={u.role === 'admin' ? 'green' : u.role === 'moderator' ? 'blue' : 'neutral'}>{u.role}</Badge>
                  </div>
                  {u.role !== 'admin' && (
                    <p className="mt-0.5 text-xs text-ink-500">
                      {u.serverAccess && u.serverAccess.length > 0
                        ? `Access to ${u.serverAccess.length} instance(s)`
                        : 'No instance access granted'}
                    </p>
                  )}
                </div>
                <Button
                  onClick={() => {
                    setEditingUser(u);
                    setEditOpen(true);
                  }}
                >
                  Edit
                </Button>
                {u.id !== me?.id && (
                  <Button variant="danger" onClick={() => deleteUser(u)}>
                    Delete
                  </Button>
                )}
              </div>
            ))}
          </Card>
        )}

      </div>

      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={load} />
      <EditUserModal
        open={editOpen}
        user={editingUser}
        servers={servers}
        onClose={() => setEditOpen(false)}
        onSaved={load}
      />
    </Layout>
  );
}

function CreateUserModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError('');
    setSubmitting(true);
    try {
      await api.post('/users', { username, password, role });
      toast.success(`Created user "${username}"`);
      onSaved();
      onClose();
      setUsername('');
      setPassword('');
      setRole('viewer');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create user">
      <div className="space-y-4">
        <Field label="Username">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} minLength={3} autoFocus />
        </Field>
        <Field label="Password">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} />
        </Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="admin">Admin — full access</option>
            <option value="moderator">Moderator — manage assigned instances</option>
            <option value="viewer">Viewer — read-only on assigned instances</option>
          </Select>
        </Field>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create user'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function EditUserModal({
  open,
  user,
  servers,
  onClose,
  onSaved,
}: {
  open: boolean;
  user: PublicUser | null;
  servers: ServerRecord[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [role, setRole] = useState<Role>('viewer');
  const [password, setPassword] = useState('');
  // Assigned instances → explicit permission set, or null for the role's defaults.
  const [access, setAccess] = useState<Record<string, ServerPermission[] | null>>({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Re-sync local form state whenever a (possibly different) user is opened for editing.
  useEffect(() => {
    if (!user) return;
    setRole(user.role);
    setPassword('');
    setAccess(Object.fromEntries((user.serverAccess ?? []).map((id) => [id, user.serverPermissions?.[id] ?? null])));
    setError('');
  }, [user]);

  async function submit() {
    if (!user) return;
    setError('');
    setSubmitting(true);
    try {
      await api.patch(`/users/${user.id}`, {
        role,
        password: password || undefined,
        serverAccess: Object.entries(access).map(([serverId, permissions]) => ({ serverId, permissions })),
      });
      toast.success(`Updated "${user.username}"`);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update user');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={user ? `Edit ${user.username}` : 'Edit user'} size="lg">
      <div className="space-y-4">
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="admin">Admin — full access</option>
            <option value="moderator">Moderator — manage assigned instances</option>
            <option value="viewer">Viewer — read-only on assigned instances</option>
          </Select>
        </Field>
        <Field label="New password (leave blank to keep current)">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} />
        </Field>
        {role !== 'admin' && <AccessEditor role={role} servers={servers} access={access} onChange={setAccess} />}
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const PERMISSION_GROUPS: { label: string; items: { key: ServerPermission; label: string }[] }[] = [
  {
    label: 'Control',
    items: [
      { key: 'power', label: 'Start / stop' },
      { key: 'console', label: 'Console commands' },
      { key: 'players', label: 'Manage players' },
    ],
  },
  {
    label: 'Files',
    items: [
      { key: 'files.read', label: 'View & download' },
      { key: 'files.write', label: 'Edit & upload' },
      { key: 'plugins', label: 'Plugins / mods' },
    ],
  },
  {
    label: 'Snapshots',
    items: [
      { key: 'backups.create', label: 'Create & schedule' },
      { key: 'backups.restore', label: 'Restore' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { key: 'settings', label: 'Edit configuration' },
      { key: 'update', label: 'Update version' },
      { key: 'launch', label: 'Edit launch command' },
      { key: 'network', label: 'UPnP port forwarding' },
    ],
  },
];

const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key));

function roleDefaults(role: Role): ServerPermission[] {
  // 'launch' runs any program on the host and 'network' opens router ports to it — never on by default.
  return role === 'viewer' ? ['files.read'] : ALL_PERMISSIONS.filter((p) => p !== 'launch' && p !== 'network');
}

/** Pick any number of instances; each gets the role's defaults or its own permission set. */
function AccessEditor({
  role,
  servers,
  access,
  onChange,
}: {
  role: Role;
  servers: ServerRecord[];
  access: Record<string, ServerPermission[] | null>;
  onChange: (next: Record<string, ServerPermission[] | null>) => void;
}) {
  const assigned = Object.keys(access).length;

  function toggleAssigned(id: string, on: boolean) {
    const next = { ...access };
    if (on) next[id] = null;
    else delete next[id];
    onChange(next);
  }

  function togglePermission(id: string, perm: ServerPermission) {
    const current = access[id] ?? roleDefaults(role);
    const nextPerms = current.includes(perm) ? current.filter((p) => p !== perm) : [...current, perm];
    onChange({ ...access, [id]: nextPerms });
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-ink-300">Instance access</span>
        <span className="text-xs text-ink-500">
          {assigned} of {servers.length} assigned
        </span>
      </div>
      <div className="max-h-[45vh] space-y-2 overflow-y-auto">
        {servers.length === 0 && <p className="text-xs text-ink-500">No instances exist yet.</p>}
        {servers.map((s) => {
          const isAssigned = s.id in access;
          const custom = access[s.id];
          const effective = custom ?? roleDefaults(role);
          return (
            <div key={s.id} className={`rounded-2xl p-3 ${isAssigned ? 'bg-surface-700' : 'bg-surface-850'}`}>
              <label className="flex cursor-pointer items-center gap-3">
                <input type="checkbox" checked={isAssigned} onChange={(e) => toggleAssigned(s.id, e.target.checked)} />
                <GameTile kind={gameKindOf(s)} className="h-8 w-8 !rounded-xl" />
                <span className="min-w-0 flex-1 truncate text-sm text-ink-100">{s.name}</span>
                {isAssigned && (
                  <span className="text-xs text-ink-400">{custom ? 'Custom permissions' : `${role === 'viewer' ? 'Viewer' : 'Moderator'} defaults`}</span>
                )}
              </label>
              {isAssigned && (
                <div className="mt-3 space-y-2 pl-7">
                  {PERMISSION_GROUPS.map((g) => (
                    <div key={g.label} className="flex flex-wrap items-center gap-1.5">
                      <span className="w-20 shrink-0 text-[11px] text-ink-500">{g.label}</span>
                      {g.items.map((item) => {
                        const on = effective.includes(item.key);
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => togglePermission(s.id, item.key)}
                            className={`state-layer rounded-lg border px-2.5 py-1 text-xs font-medium ${
                              on ? 'border-transparent bg-secondary-container text-secondary-on-container' : 'border-surface-500 text-ink-400'
                            }`}
                          >
                            {on ? '✓ ' : ''}
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  {custom && (
                    <button type="button" className="text-xs text-accent-400 hover:underline" onClick={() => onChange({ ...access, [s.id]: null })}>
                      Reset to role defaults
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-ink-500">
        Every assigned user can see the instance's status, console output and player list. Everything else needs the permission.
      </p>
    </div>
  );
}
