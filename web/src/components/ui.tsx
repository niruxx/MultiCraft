import { AnimatePresence, motion } from 'framer-motion';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

const springy = { type: 'spring' as const, stiffness: 420, damping: 32 };

export function Button({
  variant = 'default',
  className = '',
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'danger' | 'ghost' }) {
  const base =
    'relative inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium px-3.5 py-1.5 border transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed select-none';
  const variants: Record<string, string> = {
    default: 'bg-surface-800/70 hover:bg-surface-700 border-surface-700 text-slate-100',
    primary: 'bg-accent-500 hover:bg-accent-400 border-transparent text-white font-semibold',
    danger: 'bg-red-500/15 hover:bg-red-500/25 border-red-500/30 text-red-400',
    ghost: 'bg-transparent hover:bg-surface-800 border-transparent text-slate-300',
  };
  return (
    <motion.button
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={springy}
      className={`${base} ${variants[variant]} ${className}`}
      disabled={disabled}
      {...(props as any)}
    >
      {children}
    </motion.button>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg bg-surface-800/80 border border-surface-600 px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition-all duration-150 focus:border-accent-500/60 focus:ring-2 focus:ring-accent-500/25 hover:border-surface-500 ${props.className ?? ''}`}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-lg bg-surface-800/80 border border-surface-600 px-3 py-1.5 text-sm text-slate-100 outline-none transition-all duration-150 focus:border-accent-500/60 focus:ring-2 focus:ring-accent-500/25 hover:border-surface-500 ${props.className ?? ''}`}
    />
  );
}

export function Card({
  children,
  className = '',
  hover = false,
  glass = true,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  glass?: boolean;
}) {
  return (
    <motion.div
      whileHover={hover ? { y: -2, transition: springy } : undefined}
      className={`rounded-xl border border-surface-700/70 shadow-flat ${glass ? 'glass' : 'bg-surface-900'} ${className}`}
    >
      {children}
    </motion.div>
  );
}

// `green` deliberately uses the `success` palette, not `accent` — status color (good/running)
// and brand/interactive color are different concepts and must stay visually distinct.
const BADGE_TONES: Record<string, string> = {
  neutral: 'bg-surface-700/70 text-slate-300',
  green: 'bg-success-500/15 text-success-400',
  red: 'bg-red-500/15 text-red-400',
  yellow: 'bg-yellow-500/15 text-yellow-400',
  blue: 'bg-sky-500/15 text-sky-400',
};

export function Badge({
  children,
  tone = 'neutral',
  pulse = false,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'green' | 'red' | 'yellow' | 'blue';
  pulse?: boolean;
}) {
  const dotColor: Record<string, string> = {
    neutral: 'bg-slate-400',
    green: 'bg-success-400',
    red: 'bg-red-400',
    yellow: 'bg-yellow-400',
    blue: 'bg-sky-400',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_TONES[tone]}`}>
      {pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className={`absolute inline-flex h-full w-full animate-ping-slow rounded-full ${dotColor[tone]}`} />
          <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dotColor[tone]}`} />
        </span>
      )}
      {children}
    </span>
  );
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin text-current ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

const MODAL_SIZE: Record<string, string> = {
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'md' | 'lg' | 'xl';
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
        >
          <motion.div
            className={`glass flex max-h-[85vh] w-full ${MODAL_SIZE[size]} flex-col rounded-xl border border-surface-700/70 shadow-card`}
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={springy}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-surface-700/80 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
              <button onClick={onClose} className="rounded-md p-1 text-slate-400 transition-colors hover:bg-surface-800 hover:text-slate-200">
                ✕
              </button>
            </div>
            <div className="overflow-y-auto p-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <AnimatePresence>
      {Boolean(children) && (
        <motion.p
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400"
        >
          {children}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

export const fadeInUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};

export const staggerContainer = {
  animate: { transition: { staggerChildren: 0.045 } },
};
