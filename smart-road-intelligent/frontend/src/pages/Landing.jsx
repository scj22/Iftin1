import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Compass,
  Gauge,
  Github,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Logo } from '../components/brand/Logo.jsx';
import { ThemeToggle } from '../components/layout/AppShell.jsx';
import { Button } from '../components/ui/index.jsx';

export default function Landing() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-dvh bg-ink-50 dark:bg-ink-950">
      {/* ------------------------------------------------------------ Header */}
      <header className="sticky top-0 z-50 border-b border-ink-200/60 bg-white/80 backdrop-blur-xl dark:border-white/8 dark:bg-ink-950/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <div className="flex items-center gap-2">
            <ThemeToggle className="hidden sm:flex" />
            {isAuthenticated ? (
              <Button to="/app" size="sm" iconRight={ArrowRight}>
                Try Now
              </Button>
            ) : (
              <>
                <Button to="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
                  Sign in
                </Button>
                <Button to="/app/navigate" size="sm">
                  Try it now
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* --------------------------------------------------------------- CTA */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="aurora relative overflow-hidden rounded-3xl border border-ink-200/70 p-8 text-center sm:p-14 dark:border-white/8">
          <Gauge className="mx-auto size-10 text-brand-600 dark:text-brand-400" aria-hidden />
          <h2 className="mt-5 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl dark:text-white">
            Start Your Smart Journey
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-ink-600 dark:text-ink-300">
            Pick two points in Mogadishu and see the corridors, the predicted congestion and the
            reasoning — in about a quarter of a second.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button to="/register" size="lg" variant="outline">
              Create an account
            </Button>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ Footer */}
      <footer className="border-t border-ink-200/70 dark:border-white/8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <Logo size="sm" showTagline />
            <p className="mt-2 text-xs text-ink-500 dark:text-ink-400">
              Road data &copy;{' '}
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer noopener"
                className="underline hover:text-brand-600"
              >
                OpenStreetMap
              </a>{' '}
              · Weather from Open-Meteo
            </p>
          </div>
          <div>
            
          </div>
        </div>
      </footer>
    </div>
  );
}
