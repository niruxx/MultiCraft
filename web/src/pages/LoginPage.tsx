import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../state/AuthContext.js';
import { ApiError } from '../api/client.js';
import { Badge, Button, ErrorText, Field, Input } from '../components/ui.js';
import { Logo } from '../components/Logo.js';
import { ThemeToggle } from '../components/ThemeToggle.js';

const APP_VERSION = '1.0.0';

export function LoginPage() {
  const { login, user, setupRequired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (setupRequired) return <Navigate to="/setup" replace />;
  if (user) return <Navigate to={(location.state as { from?: string })?.from ?? '/'} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="grid-backdrop absolute inset-0" />
        <motion.div
          className="absolute -top-24 left-1/3 h-72 w-72 rounded-full bg-accent-500/15 blur-[100px]"
          animate={{ y: [0, 20, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
      <div className="fixed right-4 top-4 z-20">
        <ThemeToggle />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        className="glass relative z-10 w-full max-w-sm rounded-2xl border border-surface-700/80 p-7 shadow-card"
      >
        <div className="mb-6 text-center">
          <Logo className="mx-auto mb-3.5 h-11 w-11 rounded-xl shadow-glow" />
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-xl font-bold text-ink-50">Sign in to MultiCraft</h1>
            <Badge tone="neutral">v{APP_VERSION}</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-400">Manage your Minecraft servers.</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Username">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
          </Field>
          <Field label="Password">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" variant="primary" className="w-full py-2" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
