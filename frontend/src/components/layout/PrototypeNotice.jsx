import { useState } from 'react';
import { FlaskConical, Info, X } from 'lucide-react';
import { PROTOTYPE_NOTICE } from '../../lib/constants.js';
import { cn } from '../../lib/format.js';

/**
 * The label that must accompany every predicted-traffic surface. Deliberately
 * unobtrusive but always present — the product never implies live traffic.
 */
export function PrototypeBadge({ className, showTooltip = true }) {
  const [open, setOpen] = useState(false);

  return (
    <span className={cn('relative inline-flex', className)}>
      <button
        type="button"
        onClick={() => showTooltip && setOpen((value) => !value)}
        onBlur={() => setOpen(false)}
        aria-expanded={showTooltip ? open : undefined}
        aria-label={showTooltip ? 'About this prediction' : undefined}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full bg-somali-500/12 px-2.5 py-1 text-[11px] font-medium text-somali-600 transition dark:text-somali-400',
          showTooltip && 'hover:bg-somali-500/20',
          !showTooltip && 'cursor-default',
        )}
      >
        <FlaskConical className="size-3" aria-hidden />
        {PROTOTYPE_NOTICE.short}
      </button>

      {open && (
        <span
          role="tooltip"
          className="glass-strong absolute left-0 top-full z-50 mt-2 w-72 animate-fade-in rounded-xl p-3 text-[11px] leading-relaxed text-ink-600 shadow-xl dark:text-ink-300"
        >
          {PROTOTYPE_NOTICE.long}
        </span>
      )}
    </span>
  );
}

/** Fuller inline explanation, used once per page rather than per component. */
export function PrototypeNotice({ className, dismissible = false }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border border-somali-500/25 bg-somali-500/6 p-3.5 dark:bg-somali-500/10',
        className,
      )}
    >
      <Info className="mt-0.5 size-4 shrink-0 text-somali-500" aria-hidden />
      <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-600 dark:text-ink-300">
        <span className="font-semibold text-ink-800 dark:text-ink-100">
          Prototype predictions.{' '}
        </span>
        {PROTOTYPE_NOTICE.long}
      </p>
      {dismissible && (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="rounded p-1 text-ink-400 transition hover:bg-white/60 dark:hover:bg-white/10"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}
