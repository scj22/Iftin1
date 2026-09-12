import { Clock, Gauge, Route as RouteIcon, Sparkles, TrendingUp } from 'lucide-react';
import { ROUTE_COLORS } from '../../lib/constants.js';
import {
  arrivalTime,
  cn,
  formatDistance,
  formatDuration,
  formatSpeed,
} from '../../lib/format.js';
import { TrafficBadge } from '../ui/index.jsx';

export function RouteCard({ route, index, selected, onSelect, departure }) {
  const color = route.is_recommended
    ? ROUTE_COLORS.recommended
    : ROUTE_COLORS.alternatives[(index - 1) % ROUTE_COLORS.alternatives.length];

  return (
    <button
      type="button"
      onClick={() => onSelect(route.id)}
      aria-pressed={selected}
      className={cn(
        'group relative w-full overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200',
        selected
          ? 'border-brand-500/60 bg-brand-500/5 shadow-md ring-1 ring-brand-500/25 dark:bg-brand-500/10'
          : 'border-ink-200/70 bg-white hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-md dark:border-white/8 dark:bg-ink-850 dark:hover:border-white/16',
      )}
    >
      {/* Route colour key, matching the polyline on the map */}
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: color }}
        aria-hidden
      />

      <div className="flex items-start justify-between gap-3 pl-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {route.is_recommended ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm">
                <Sparkles className="size-3" aria-hidden />
                Best route
              </span>
            ) : (
              <span className="text-sm font-semibold text-ink-800 dark:text-ink-100">
                {route.name}
              </span>
            )}
            <TrafficBadge level={route.traffic_level} />
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
              {formatDuration(route.duration_minutes)}
            </span>
            <span className="text-sm text-ink-500 dark:text-ink-400">
              {formatDistance(route.distance_km)}
            </span>
          </div>

          <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
            Arrive around {arrivalTime(route.duration_minutes, departure)}
            {route.delay_minutes > 0.5 && (
              <>
                {' · '}
                <span className="text-amber-600 dark:text-amber-400">
                  +{route.delay_minutes.toFixed(0)} min from congestion
                </span>
              </>
            )}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <div
            className="text-lg font-semibold tabular-nums"
            style={{ color }}
            title="Composite route score out of 100"
          >
            {route.score.toFixed(0)}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-ink-400">score</div>
        </div>
      </div>

      <dl className="mt-3.5 grid grid-cols-3 gap-2 border-t border-ink-200/60 pl-2 pt-3 dark:border-white/8">
        <Metric icon={Gauge} label="Speed" value={formatSpeed(route.mean_speed_kmh)} />
        <Metric icon={RouteIcon} label="Segments" value={route.segment_count} />
        <Metric
          icon={TrendingUp}
          label="Road quality"
          value={`${(route.road_quality_score * 100).toFixed(0)}%`}
        />
      </dl>

      {!route.is_recommended && route.comparison_to_best && (
        <p className="mt-3 flex items-center gap-1.5 pl-2 text-xs text-ink-500 dark:text-ink-400">
          <Clock className="size-3.5 shrink-0" aria-hidden />
          {route.comparison_to_best.extra_minutes > 0
            ? `${route.comparison_to_best.extra_minutes.toFixed(0)} min slower than the recommended route`
            : `${Math.abs(route.comparison_to_best.extra_minutes).toFixed(0)} min faster, but scores lower overall`}
        </p>
      )}
    </button>
  );
}

function Metric({ icon: Icon, label, value }) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-ink-400">
        <Icon className="size-3" aria-hidden />
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium tabular-nums text-ink-800 dark:text-ink-100">
        {value}
      </dd>
    </div>
  );
}
