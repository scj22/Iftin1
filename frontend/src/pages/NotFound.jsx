import { Compass, Home, MapPinOff } from 'lucide-react';
import { Button } from '../components/ui/index.jsx';
import { Logo } from '../components/brand/Logo.jsx';

export default function NotFound() {
  return (
    <div className="aurora flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <Logo size="md" className="mb-10" />
      <span className="grid size-16 place-items-center rounded-2xl bg-white/70 text-brand-600 shadow-sm backdrop-blur dark:bg-white/10 dark:text-brand-400">
        <MapPinOff className="size-8" aria-hidden />
      </span>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-ink-900 dark:text-white">
        This road leads nowhere
      </h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-600 dark:text-ink-300">
        The page you were looking for is not on our map. Let us get you back on route.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Button to="/app" icon={Home}>
          Go to dashboard
        </Button>
        <Button to="/app/navigate" variant="outline" icon={Compass}>
          Plan a journey
        </Button>
      </div>
    </div>
  );
}
