import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { cn, trafficStyle } from '../../lib/format.js';

/* ------------------------------------------------------------------ Button */

const BUTTON_VARIANTS = {
  primary:
    'bg-brand-600 text-white shadow-sm shadow-brand-600/25 hover:bg-brand-500 active:bg-brand-700 disabled:bg-brand-600/50',
  secondary:
    'bg-ink-100 text-ink-800 hover:bg-ink-200 active:bg-ink-200/80 dark:bg-white/8 dark:text-ink-100 dark:hover:bg-white/14',
  outline:
    'border border-ink-200 bg-white text-ink-700 hover:bg-ink-50 dark:border-white/12 dark:bg-transparent dark:text-ink-200 dark:hover:bg-white/8',
  ghost:
    'text-ink-600 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-white/8 dark:hover:text-white',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-500 active:bg-red-700',
  subtle: 'bg-brand-500/10 text-brand-700 hover:bg-brand-500/18 dark:text-brand-300',
};

const BUTTON_SIZES = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
  icon: 'h-10 w-10 justify-center',
};

export const Button = forwardRef(function Button(
  {
    as,
    variant = 'primary',
    size = 'md',
    loading = false,
    icon: Icon,
    iconRight: IconRight,
    className,
    children,
    disabled,
    ...props
  },
  ref,
) {
  const Component = as ?? (props.to ? Link : 'button');
  const isDisabled = disabled || loading;

  return (
    <Component
      ref={ref}
      disabled={Component === 'button' ? isDisabled : undefined}
      aria-busy={loading || undefined}
      aria-disabled={isDisabled || undefined}
      className={cn(
        'inline-flex select-none items-center rounded-xl font-medium transition-all duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
        'active:scale-[0.985] disabled:pointer-events-none disabled:opacity-60',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
      ) : (
        Icon && <Icon className="size-4 shrink-0" aria-hidden />
      )}
      {children}
      {IconRight && !loading && <IconRight className="size-4 shrink-0" aria-hidden />}
    </Component>
  );
});

/* -------------------------------------------------------------------- Card */

export function Card({ className, as: Component = 'div', hover = false, ...props }) {
  return (
    <Component
      className={cn(
        'panel',
        hover && 'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ title, description, icon: Icon, action, className }) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
            <Icon className="size-4.5" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-ink-900 dark:text-ink-50">{title}</h3>
          {description && (
            <p className="mt-0.5 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
              {description}
            </p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------- Badge */

const BADGE_TONES = {
  neutral: 'bg-ink-100 text-ink-600 dark:bg-white/8 dark:text-ink-300',
  brand: 'bg-brand-500/12 text-brand-700 dark:text-brand-300',
  success: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
  warning: 'bg-amber-500/12 text-amber-700 dark:text-amber-400',
  danger: 'bg-red-500/12 text-red-700 dark:text-red-400',
  outline: 'border border-ink-200 text-ink-600 dark:border-white/12 dark:text-ink-300',
};

export function Badge({ tone = 'neutral', icon: Icon, className, children, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        BADGE_TONES[tone],
        className,
      )}
      {...props}
    >
      {Icon && <Icon className="size-3.5" aria-hidden />}
      {children}
    </span>
  );
}

/** Traffic level pill. Colour meaning is fixed app-wide. */
export function TrafficBadge({ level, className, showDot = true }) {
  const style = trafficStyle(level);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1',
        style.bg,
        style.text,
        style.ring,
        className,
      )}
    >
      {showDot && <span className={cn('size-1.5 rounded-full', style.dot)} aria-hidden />}
      {style.label}
    </span>
  );
}

/* --------------------------------------------------------------- Skeletons */

export function Skeleton({ className }) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}

export function SkeletonText({ lines = 3, className }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className={cn('h-3.5', index === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ States */

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {Icon && (
        <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-brand-500/10 text-brand-500">
          <Icon className="size-7" aria-hidden />
        </span>
      )}
      <p className="text-base font-semibold text-ink-900 dark:text-ink-50">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-500 dark:text-ink-400">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', message, onRetry, className }) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-10 text-center', className)}>
      <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-red-500/10 text-red-500">
        <AlertCircle className="size-6" aria-hidden />
      </span>
      <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">{title}</p>
      {message && (
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-500 dark:text-ink-400">
          {message}
        </p>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" icon={RefreshCw} className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Spinner({ className, label = 'Loading' }) {
  return (
    <span role="status" aria-label={label}>
      <Loader2 className={cn('size-5 animate-spin text-brand-500', className)} aria-hidden />
    </span>
  );
}

/* ------------------------------------------------------------------ Inputs */

export const Input = forwardRef(function Input(
  { className, icon: Icon, invalid, ...props },
  ref,
) {
  return (
    <div className="relative">
      {Icon && (
        <Icon
          className="pointer-events-none absolute left-3 top-1/2 size-4.5 -translate-y-1/2 text-ink-400"
          aria-hidden
        />
      )}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          'h-11 w-full rounded-xl border bg-white px-3.5 text-sm text-ink-900 transition',
          'placeholder:text-ink-400 focus:outline-none focus:ring-2',
          'dark:bg-ink-900 dark:text-ink-50',
          invalid
            ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
            : 'border-ink-200 focus:border-brand-500 focus:ring-brand-500/20 dark:border-white/10 dark:focus:border-brand-500',
          Icon && 'pl-10',
          className,
        )}
        {...props}
      />
    </div>
  );
});

export function Field({ label, hint, error, htmlFor, children, className }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label
          htmlFor={htmlFor}
          className="text-sm font-medium text-ink-700 dark:text-ink-200"
        >
          {label}
        </label>
        {hint && <span className="text-xs text-ink-400">{hint}</span>}
      </div>
      {children}
      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- Stats */

export function StatTile({ label, value, unit, icon: Icon, tone = 'brand', hint, className }) {
  const tones = {
    brand: 'text-brand-600 dark:text-brand-400 bg-brand-500/10',
    success: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
    warning: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
    danger: 'text-red-600 dark:text-red-400 bg-red-500/10',
    neutral: 'text-ink-600 dark:text-ink-300 bg-ink-500/10',
  };

  return (
    <div className={cn('panel p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-500 dark:text-ink-400">
          {label}
        </p>
        {Icon && (
          <span className={cn('grid size-7 place-items-center rounded-lg', tones[tone])}>
            <Icon className="size-3.5" aria-hidden />
          </span>
        )}
      </div>
      <p className="mt-2 flex items-baseline gap-1 text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
        {value}
        {unit && <span className="text-sm font-medium text-ink-400">{unit}</span>}
      </p>
      {hint && <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ Toggle */

export function Switch({ checked, onChange, label, description, id }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-ink-800 dark:text-ink-100">
          {label}
        </label>
        {description && (
          <p className="mt-0.5 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
            {description}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
          checked ? 'bg-brand-600' : 'bg-ink-300 dark:bg-ink-700',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200',
            checked ? 'translate-x-5.5' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ Layout */

export function PageHeader({ title, description, actions, className }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50 sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-500 dark:text-ink-400">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, action, className }) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-3', className)}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">
        {children}
      </h2>
      {action}
    </div>
  );
}
