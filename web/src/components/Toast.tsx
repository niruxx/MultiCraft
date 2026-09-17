import { AnimatePresence, motion } from 'framer-motion';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastState {
  show: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastState | null>(null);

const ICONS: Record<ToastKind, ReactNode> = {
  success: <span className="text-accent-400">✓</span>,
  error: <span className="text-red-400">✕</span>,
  info: <span className="text-sky-400">ℹ</span>,
};

const RING: Record<ToastKind, string> = {
  success: 'ring-accent-500/25',
  error: 'ring-red-500/25',
  info: 'ring-sky-500/25',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const show = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const value: ToastState = {
    show,
    success: (message) => show(message, 'success'),
    error: (message) => show(message, 'error'),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className={`glass pointer-events-auto flex items-start gap-2.5 rounded-lg border border-surface-700/80 px-3.5 py-3 text-sm text-slate-200 shadow-card ring-1 ${RING[t.kind]}`}
            >
              <span className="mt-0.5">{ICONS[t.kind]}</span>
              <span className="flex-1 leading-snug">{t.message}</span>
              <button
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                className="text-slate-500 hover:text-slate-300"
              >
                ✕
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastState {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
