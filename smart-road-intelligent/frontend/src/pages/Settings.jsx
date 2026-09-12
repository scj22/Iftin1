import { useState } from 'react';
import {
  Activity,
  Database,
  Monitor,
  Moon,
  Palette,
  Sun,
} from 'lucide-react';
import { cn } from '../lib/format.js';
import { useTheme } from '../context/ThemeContext.jsx';
import { Button, Card, CardHeader, PageHeader, Switch } from '../components/ui/index.jsx';

const THEMES = [
  { value: 'light', label: 'Light', icon: Sun, description: 'Bright surfaces, best in daylight' },
  { value: 'dark', label: 'Dark', icon: Moon, description: 'Deep navy, easier at night' },
  { value: 'system', label: 'System', icon: Monitor, description: 'Follow your device setting' },
];

const MOTION_KEY = 'smartroad.reduceMotion';

export default function Settings() {
  const { theme, setTheme } = useTheme();

  const [reduceMotion, setReduceMotion] = useState(() => {
    try {
      return localStorage.getItem(MOTION_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const toggleMotion = (value) => {
    setReduceMotion(value);
    document.documentElement.classList.toggle('motion-reduce', value);
    try {
      localStorage.setItem(MOTION_KEY, String(value));
    } catch {
      /* Storage blocked; the setting still applies this session. */
    }
  };

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <PageHeader title="Settings" description="Appearance, accessibility and the state of each service." />

      <Card className="p-5">
        <CardHeader icon={Palette} title="Appearance" description="Light and dark are designed separately, not inverted" />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {THEMES.map((option) => {
            const Icon = option.icon;
            const active = theme === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setTheme(option.value)}
                aria-pressed={active}
                className={cn(
                  'flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all',
                  active
                    ? 'border-brand-500 bg-brand-500/8 ring-1 ring-brand-500/25'
                    : 'border-ink-200 hover:border-ink-300 hover:bg-ink-50 dark:border-white/10 dark:hover:bg-white/5',
                )}
              >
                <span
                  className={cn(
                    'grid size-9 place-items-center rounded-lg',
                    active
                      ? 'bg-brand-500 text-white'
                      : 'bg-ink-100 text-ink-500 dark:bg-white/8 dark:text-ink-300',
                  )}
                >
                  <Icon className="size-4.5" aria-hidden />
                </span>
                <span className="text-sm font-medium text-ink-900 dark:text-ink-50">
                  {option.label}
                </span>
                <span className="text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="p-5">
        <CardHeader icon={Activity} title="Accessibility" />
        <div className="mt-4">
          <Switch
            id="reduce-motion"
            checked={reduceMotion}
            onChange={toggleMotion}
            label="Reduce motion"
            description="Turns off route drawing, map fly-to animations and card transitions. Your operating system's reduced-motion setting is always respected regardless of this toggle."
          />
        </div>
      </Card>

      <Card className="p-5">
        <CardHeader icon={Database} title="About this build" />
        <dl className="mt-4 space-y-2.5">
          {[
            { label: 'City', value: 'Mogadishu, Banaadir, Somalia' },
            { label: 'Traffic data', value: 'Prototype predictions — not live observations' },
            { label: 'Basemap', value: 'OpenStreetMap raster tiles (no billing required)' },
            { label: 'Geocoding', value: 'OpenStreetMap Nominatim with a built-in offline gazetteer' },
            { label: 'Weather', value: 'Open-Meteo live, falling back to prepared 2025 normals' },
          ].map((row) => (
            <div key={row.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
              <dt className="w-32 shrink-0 text-[11px] uppercase tracking-wide text-ink-400">
                {row.label}
              </dt>
              <dd className="text-xs text-ink-700 dark:text-ink-200">{row.value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
