import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AuthProvider, useAuth } from './state/AuthContext.js';
import { ToastProvider } from './components/Toast.js';
import { LoginPage } from './pages/LoginPage.js';
import { SetupPage } from './pages/SetupPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { ServerPage } from './pages/ServerPage.js';
import { UsersPage } from './pages/UsersPage.js';
import type { ReactNode } from 'react';

function FullScreenLoader() {
  return (
    <div className="flex h-screen items-center justify-center bg-surface-950">
      <motion.div
        className="h-9 w-9 rounded-lg bg-brand-gradient bg-[length:200%_auto] shadow-glow-lg"
        animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'], rotate: [0, 6, -6, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, setupRequired } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (setupRequired) return <Navigate to="/setup" replace />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { setupRequired, loading } = useAuth();
  if (loading) return <FullScreenLoader />;

  return (
    <Routes>
      <Route path="/setup" element={setupRequired ? <SetupPage /> : <Navigate to="/" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <DashboardPage />
          </RequireAuth>
        }
      />
      <Route
        path="/servers/:serverId/*"
        element={
          <RequireAuth>
            <ServerPage />
          </RequireAuth>
        }
      />
      <Route
        path="/users"
        element={
          <RequireAuth>
            <RequireAdmin>
              <UsersPage />
            </RequireAdmin>
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
