import {
  BrainCircuit,
  Ruler,
} from 'lucide-react';
import { cn } from '../../lib/format.js';

/**
 * The competition-critical panel: why this route, expressed with the actual
 * numbers behind the decision, plus an audit trail of which component produced
 * which value.
 */
export function Explanation({ explanation, className }) {
  if (!explanation) return null;

  const { headline } = explanation;

  return (
    <section
      className={cn('overflow-hidden rounded-2xl border border-brand-500/25 bg-gradient-to-br from-brand-500/8 to-somali-500/5 dark:from-brand-500/12 dark:to-somali-500/8', className)}
      aria-labelledby="explanation-heading"
    >
      <div className="border-b border-brand-500/15 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-600 text-white shadow-sm">
            <BrainCircuit className="size-4.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3
              id="explanation-heading"
              className="text-sm font-semibold text-ink-900 dark:text-ink-50"
            >
              Why Smart Road recommends this route
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-700 dark:text-ink-200">
              {headline}
            </p>
          </div>
        </div>
      </div>

    </section>
  );
}

/** Side-by-side numeric comparison of the recommended route and each option. */
export function RouteComparison({ routes, className }) {
  if (routes.length < 2) return null;

  const rows = [
    { key: 'duration_minutes', label: 'Travel time', format: (v) => `${v.toFixed(0)} min` },
    { key: 'distance_km', label: 'Distance', format: (v) => `${v.toFixed(2)} km` },
    { key: 'mean_speed_kmh', label: 'Mean speed', format: (v) => `${v.toFixed(0)} km/h` },
    { key: 'traffic_level', label: 'Traffic', format: (v) => v },
    {
      key: 'road_quality_score',
      label: 'Road quality',
      format: (v) => `${(v * 100).toFixed(0)}%`,
    },
    { key: 'score', label: 'Score', format: (v) => v.toFixed(0) },
  ];

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full min-w-md text-sm">
        <thead>
          <tr className="border-b border-ink-200/70 dark:border-white/8">
            <th className="py-2 pr-3 text-left text-xs font-medium uppercase tracking-wide text-ink-400">
              Metric
            </th>
            {routes.map((route) => (
              <th
                key={route.id}
                className={cn(
                  'px-3 py-2 text-right text-xs font-semibold',
                  route.is_recommended
                    ? 'text-brand-600 dark:text-brand-400'
                    : 'text-ink-500 dark:text-ink-400',
                )}
              >
                {route.is_recommended ? 'Recommended' : route.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              className="border-b border-ink-200/50 last:border-0 dark:border-white/5"
            >
              <td className="py-2.5 pr-3 text-xs text-ink-500 dark:text-ink-400">{row.label}</td>
              {routes.map((route) => (
                <td
                  key={route.id}
                  className={cn(
                    'px-3 py-2.5 text-right tabular-nums',
                    route.is_recommended
                      ? 'font-semibold text-ink-900 dark:text-ink-50'
                      : 'text-ink-600 dark:text-ink-300',
                  )}
                >
                  {row.format(route[row.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Per-leg breakdown of the selected route. */
export function RouteSteps({ steps = [], className }) {
  if (!steps.length) return null;

  return (
    <ol className={cn('space-y-0', className)}>
      {steps.map((step, index) => (
        <li key={index} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span
              className={cn(
                'mt-1 size-2.5 shrink-0 rounded-full ring-4',
                step.traffic_level === 'HIGH'
                  ? 'bg-red-500 ring-red-500/15'
                  : step.traffic_level === 'MEDIUM'
                    ? 'bg-amber-500 ring-amber-500/15'
                    : 'bg-emerald-500 ring-emerald-500/15',
              )}
              aria-hidden
            />
            {index < steps.length - 1 && (
              <span className="my-1 w-px flex-1 bg-ink-200 dark:bg-white/10" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1 pb-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="text-sm font-medium text-ink-800 dark:text-ink-100">
                {step.road_class}
              </p>
              <span className="text-xs tabular-nums text-ink-500 dark:text-ink-400">
                {step.distance_m >= 1000
                  ? `${(step.distance_m / 1000).toFixed(1)} km`
                  : `${Math.round(step.distance_m)} m`}
                {' · '}
                {step.speed_kmh} km/h
              </span>
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500 dark:text-ink-400">
              <Ruler className="size-3" aria-hidden />
              {step.surface}
              {step.lanes > 1 && ` · ${step.lanes} lanes`}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
