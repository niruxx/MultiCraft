import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AuthProvider, useAuth } from './state/AuthContext.js';
import { ThemeProvider } from './state/ThemeContext.js';
import { ToastProvider } from './components/Toast.js';
import { ConfirmProvider } from './components/ConfirmDialog.js';
import { Logo } from './components/Logo.js';
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
        animate={{ opacity: [1, 0.5, 1] }}
        transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Logo className="h-9 w-9 rounded-lg shadow-glow" />
      </motion.div>
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
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <ConfirmProvider>
              <AppRoutes />
            </ConfirmProvider>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
