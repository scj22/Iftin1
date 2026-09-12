import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '../lib/format.js';

const ToastContext = createContext(null);

const VARIANTS = {
  success: { icon: CheckCircle2, accent: 'text-emerald-500', bar: 'bg-emerald-500' },
  error: { icon: XCircle, accent: 'text-red-500', bar: 'bg-red-500' },
  warning: { icon: AlertTriangle, accent: 'text-amber-500', bar: 'bg-amber-500' },
  info: { icon: Info, accent: 'text-brand-500', bar: 'bg-brand-500' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (message, { variant = 'info', title, duration = 5000 } = {}) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((current) => [...current.slice(-3), { id, message, variant, title }]);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  // Clear pending timers if the provider unmounts mid-flight.
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const value = useMemo(
    () => ({
      push,
      dismiss,
      success: (message, options) => push(message, { ...options, variant: 'success' }),
      error: (message, options) => push(message, { ...options, variant: 'error', duration: 7000 }),
      warning: (message, options) => push(message, { ...options, variant: 'warning' }),
      info: (message, options) => push(message, { ...options, variant: 'info' }),
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[1200] flex flex-col items-center gap-2 p-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-4 sm:inset-x-auto sm:right-0 sm:top-0 sm:items-end sm:justify-start sm:pb-4"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((toast) => {
          const variant = VARIANTS[toast.variant] ?? VARIANTS.info;
          const Icon = variant.icon;
          return (
            <div
              key={toast.id}
              role="status"
              aria-live="polite"
              className="glass-strong pointer-events-auto flex w-full max-w-sm animate-fade-up items-start gap-3 overflow-hidden rounded-xl p-3 pl-0"
            >
              <span className={cn('h-full w-1 self-stretch rounded-full', variant.bar)} />
              <Icon className={cn('mt-0.5 size-5 shrink-0', variant.accent)} aria-hidden />
              <div className="min-w-0 flex-1">
                {toast.title && (
                  <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                    {toast.title}
                  </p>
                )}
                <p className="text-sm leading-snug text-ink-700 dark:text-ink-300">
                  {toast.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
                className="rounded-md p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-white/10 dark:hover:text-ink-100"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
