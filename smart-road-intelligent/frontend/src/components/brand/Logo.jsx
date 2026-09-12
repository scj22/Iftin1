import { cn } from '../../lib/format.js';

/**
 * Smart Road mark: a road narrowing to the horizon, its centre line rising into
 * a signal node — road, navigation and intelligence in one shape. Drawn inline
 * so it inherits currentColor and stays crisp at every size.
 */
export function LogoMark({ className, animated = false }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      className={cn('size-9', className)}
      role="img"
      aria-label="Smart Road"
    >
      <defs>
        <linearGradient id="sr-road" x1="20" y1="38" x2="20" y2="4" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--color-brand-600)" />
          <stop offset="1" stopColor="var(--color-somali-500)" />
        </linearGradient>
        <linearGradient id="sr-node" x1="8" y1="8" x2="32" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--color-sand-300)" />
          <stop offset="1" stopColor="var(--color-sand-500)" />
        </linearGradient>
      </defs>

      <rect width="40" height="40" rx="11" fill="url(#sr-road)" />

      {/* Road edges converging toward the horizon */}
      <path
        d="M11.5 35.5 17.2 13.4M28.5 35.5 22.8 13.4"
        stroke="white"
        strokeOpacity="0.92"
        strokeWidth="2.4"
        strokeLinecap="round"
      />

      {/* Dashed centre line */}
      <path
        d="M20 34.2v-3.6M20 27.4v-3.4M20 20.9v-3.1"
        stroke="white"
        strokeOpacity="0.75"
        strokeWidth="1.9"
        strokeLinecap="round"
        className={animated ? 'animate-pulse' : undefined}
      />

      {/* Intelligence node at the vanishing point */}
      <circle cx="20" cy="10.2" r="5.1" fill="url(#sr-node)" />
      <circle cx="20" cy="10.2" r="2.1" fill="var(--color-ink-950)" fillOpacity="0.82" />
    </svg>
  );
}

export function Logo({ className, showTagline = false, size = 'md' }) {
  const sizes = {
    sm: { mark: 'size-7', name: 'text-sm', tag: 'text-[10px]' },
    md: { mark: 'size-9', name: 'text-base', tag: 'text-[11px]' },
    lg: { mark: 'size-12', name: 'text-xl', tag: 'text-xs' },
  }[size];

  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark className={sizes.mark} />
      <span className="min-w-0 leading-tight">
        <span
          className={cn(
            'block font-semibold tracking-tight text-ink-900 dark:text-white',
            sizes.name,
          )}
        >
          Smart<span className="text-brand-500">Road</span>
        </span>
        {showTagline && (
          <span className={cn('block text-ink-500 dark:text-ink-400', sizes.tag)}>
            Smarter roads. Faster journeys.
          </span>
        )}
      </span>
    </span>
  );
}
