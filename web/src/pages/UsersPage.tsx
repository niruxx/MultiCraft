import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../components/Layout.js';
import { Badge, Button, Card, ErrorText, Field, Input, Modal, Select } from '../components/ui.js';
import { useToast } from '../components/Toast.js';
import { api, ApiError } from '../api/client.js';
import type { PublicUser, Role, ServerRecord } from '../api/types.js';
import { useAuth } from '../state/AuthContext.js';

export function UsersPage() {
  const { user: me } = useAuth();
  const toast = useToast();
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
    if (!window.confirm(`Delete user "${user.username}"?`)) return;
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
      <div className="mx-auto max-w-3xl px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-center justify-between"
        >
          <div>
            <h1 className="text-2xl font-bold text-white">Users</h1>
            <p className="text-sm text-slate-400">Manage panel accounts and per-server access.</p>
          </div>
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            + New user
          </Button>
        </motion.div>

        {users === null ? (
          <p className="text-sm text-slate-500">Loading…</p>
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
                    <span className="font-medium text-slate-100">{u.username}</span>
                    <Badge tone={u.role === 'admin' ? 'green' : u.role === 'moderator' ? 'blue' : 'neutral'}>{u.role}</Badge>
                  </div>
                  {u.role !== 'admin' && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {u.serverAccess && u.serverAccess.length > 0
                        ? `Access to ${u.serverAccess.length} server(s)`
                        : 'No server access granted'}
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
            <option value="moderator">Moderator — manage assigned servers</option>
            <option value="viewer">Viewer — read-only on assigned servers</option>
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
  const [access, setAccess] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Re-sync local form state whenever a (possibly different) user is opened for editing.
  useEffect(() => {
    if (!user) return;
    setRole(user.role);
    setPassword('');
    setAccess(user.serverAccess ?? []);
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
        serverAccess: access,
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
    <Modal open={open} onClose={onClose} title={user ? `Edit ${user.username}` : 'Edit user'}>
      <div className="space-y-4">
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="admin">Admin — full access</option>
            <option value="moderator">Moderator — manage assigned servers</option>
            <option value="viewer">Viewer — read-only on assigned servers</option>
          </Select>
        </Field>
        <Field label="New password (leave blank to keep current)">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} />
        </Field>
        {role !== 'admin' && (
          <Field label="Server access">
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-surface-700 p-2">
              {servers.length === 0 && <p className="text-xs text-slate-500">No servers exist yet.</p>}
              {servers.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={access.includes(s.id)}
                    onChange={(e) =>
                      setAccess((prev) => (e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)))
                    }
                  />
                  {s.name}
                </label>
              ))}
            </div>
          </Field>
        )}
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
