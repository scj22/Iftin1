import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Database, ServerCrash, X } from 'lucide-react';
import { api } from '../../lib/api.js';
import { cn } from '../../lib/format.js';

const ServiceStatusContext = createContext(null);

/**
 * Tracks which backing services are actually up so the UI can degrade honestly
 * rather than showing controls that cannot work.
 */
export function ServiceStatusProvider({ children }) {
  const [status, setStatus] = useState(null);
  const [checked, setChecked] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.health());
    } catch {
      setStatus({
        status: 'unreachable',
        degraded: ['backend'],
        capabilities: { navigation: false, traffic: false, accounts: false, routeHistory: false },
      });
    } finally {
      setChecked(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Re-check periodically so a service coming back is picked up without a reload.
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const value = useMemo(
    () => ({
      status,
      checked,
      refresh,
      capabilities: status?.capabilities ?? {
        navigation: true,
        traffic: true,
        accounts: true,
        routeHistory: true,
      },
      aiReachable: status?.aiService?.reachable !== false,
      dbConnected: status?.database?.connected !== false,
    }),
    [status, checked, refresh],
  );

  return (
    <ServiceStatusContext.Provider value={value}>{children}</ServiceStatusContext.Provider>
  );
}

export function useServiceStatus() {
  const context = useContext(ServiceStatusContext);
  if (!context) throw new Error('useServiceStatus must be used inside ServiceStatusProvider');
  return context;
}

/** Explains a degraded state in plain language, with the command to fix it. */
export function ServiceStatusBanner({ className }) {
  const { status } = useServiceStatus();
  const [dismissed, setDismissed] = useState(false);

  const degraded = status?.degraded ?? [];
  if (!status || degraded.length === 0 || dismissed) return null;

  const isBackendDown = status.status === 'unreachable';
  const aiDown = degraded.includes('ai-service');
  const dbDown = degraded.includes('database');

  const messages = [];
  if (isBackendDown) {
    messages.push({
      icon: ServerCrash,
      text: 'The Smart Road API is not reachable. Start it with: npm run dev in backend/',
    });
  } else {
    if (aiDown) {
      messages.push({
        icon: ServerCrash,
        text: 'The AI service is offline, so routing and traffic predictions are unavailable. Start it with: uvicorn app.main:app --port 8000 in ai-service/',
      });
    }
    if (dbDown) {
      messages.push({
        icon: Database,
        text: 'The database is offline. Navigation and traffic still work, but accounts and saved routes are unavailable.',
      });
    }
  }

  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5',
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        {messages.map((message) => (
          <p
            key={message.text}
            className="text-xs leading-relaxed text-amber-900 dark:text-amber-200"
          >
            {message.text}
          </p>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="rounded p-1 text-amber-700 transition hover:bg-amber-500/20 dark:text-amber-300"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
