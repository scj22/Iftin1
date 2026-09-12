import { Link } from 'react-router-dom';
import { Logo } from '../components/brand/Logo.jsx';
import { ThemeToggle } from '../components/layout/AppShell.jsx';

/** Split layout shared by sign in, register and password reset. */
export function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-dvh bg-ink-50 dark:bg-ink-950">
      {/* Brand panel, desktop only */}
      <aside className="aurora relative hidden w-1/2 overflow-hidden p-10 lg:flex xl:p-14">
        <div
          className="pointer-events-none absolute inset-0 opacity-40 dark:opacity-25"
          style={{
            backgroundImage:
              'linear-gradient(rgba(16, 96, 110, 0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(16, 96, 110, 0.12) 1px, transparent 1px)',
            backgroundSize: '42px 42px',
          }}
          aria-hidden
        />
        <div className="pointer-events-none absolute -left-16 top-1/2 h-px w-[120%] rotate-[18deg] bg-brand-500/30" aria-hidden />
        <div className="pointer-events-none absolute -left-20 top-[58%] h-px w-[120%] rotate-[18deg] bg-somali-500/20" aria-hidden />

        <div className="relative flex h-full flex-col">
          <Link to="/" className="self-start">
            <Logo size="lg" showTagline />
          </Link>

          <div className="my-auto max-w-md py-16">
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-700 dark:text-brand-300">
              Mogadishu · Banaadir
            </p>
            <div className="flex items-center gap-3" aria-hidden>
              <div className="h-px w-16 bg-brand-500" />
              <span className="size-1.5 rounded-full bg-brand-500" />
            </div>


            <div className="glass-strong relative mt-12 max-w-sm overflow-hidden rounded-3xl p-4 ring-1 ring-brand-500/10" aria-hidden>
              <div className="flex items-center justify-between border-b border-ink-900/10 pb-3 text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-500 dark:border-white/10 dark:text-ink-400">
                <span>Route intelligence</span>
                <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Online
                </span>
              </div>

              <div className="relative h-36">
                <div className="absolute left-[8%] top-[58%] h-px w-[42%] rotate-[18deg] bg-brand-500/55" />
                <div className="absolute left-[38%] top-[43%] h-px w-[35%] -rotate-[28deg] bg-brand-500/40" />
                <div className="absolute left-[56%] top-[43%] h-px w-[35%] rotate-[38deg] bg-somali-500/45" />
                <div className="absolute left-[20%] top-[67%] h-px w-[56%] -rotate-[8deg] bg-ink-900/15 dark:bg-white/20" />

                <span className="absolute left-[5%] top-[52%] grid size-5 place-items-center rounded-full border-4 border-brand-500/20 bg-brand-600 shadow-lg shadow-brand-900/20">
                  <span className="size-1.5 rounded-full bg-white" />
                </span>
                <span className="absolute left-[45%] top-[35%] size-2 rounded-full bg-somali-500 ring-4 ring-somali-500/15" />
                <span className="absolute right-[4%] top-[62%] grid size-6 place-items-center rounded-full border-4 border-emerald-500/20 bg-emerald-600 shadow-lg shadow-emerald-900/20">
                  <span className="size-1.5 rounded-full bg-white" />
                </span>

                <span className="absolute left-0 top-[82%] text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-500 dark:text-ink-400">
                  Start
                </span>
                <span className="absolute right-0 top-[82%] text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-500 dark:text-ink-400">
                  Destination
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
            <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
            Road intelligence platform
          </div>
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-sm animate-fade-up">
          <div className="mb-8 lg:hidden">
            <Link to="/">
              <Logo size="md" />
            </Link>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-ink-900 dark:text-white">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 text-sm leading-relaxed text-ink-500 dark:text-ink-400">
              {subtitle}
            </p>
          )}

          <div className="mt-7">{children}</div>

          {footer && (
            <p className="mt-6 text-center text-sm text-ink-500 dark:text-ink-400">{footer}</p>
          )}
        </div>
      </main>
    </div>
  );
}
