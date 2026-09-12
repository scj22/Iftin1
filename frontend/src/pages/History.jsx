import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bookmark,
  Compass,
  Gauge,
  MapPin,
  Repeat,
  Route as RouteIcon,
  Sparkles,
  Timer,
  Trash2,
} from 'lucide-react';
import { api } from '../lib/api.js';
import {
  formatDistance,
  formatDuration,
  formatSpeed,
  hourLabel,
  relativeTime,
} from '../lib/format.js';
import { useAsync } from '../hooks/index.js';
import { useToast } from '../context/ToastContext.jsx';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  StatTile,
  TrafficBadge,
} from '../components/ui/index.jsx';

export default function HistoryPage() {
  const toast = useToast();
  const [deleting, setDeleting] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const list = useAsync((options) => api.history.list({ limit: 50 }, options), []);
  const stats = useAsync((options) => api.history.stats(options), []);

  const refreshAll = () => {
    list.retry();
    stats.retry();
  };

  const remove = async (id) => {
    setDeleting(id);
    try {
      await api.history.remove(id);
      toast.success('Route removed from your history.');
      refreshAll();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setDeleting(null);
    }
  };

  const clearAll = async () => {
    try {
      const { deletedCount } = await api.history.clear();
      toast.success(`Cleared ${deletedCount} saved ${deletedCount === 1 ? 'route' : 'routes'}.`);
      setConfirmClear(false);
      refreshAll();
    } catch (error) {
      toast.error(error.message);
    }
  };

  if (list.error) {
    return (
      <div className="p-4 sm:p-6">
        <ErrorState
          title="Could not load your history"
          message={list.error.message}
          onRetry={list.retry}
          className="panel"
        />
      </div>
    );
  }

  const entries = list.data?.entries ?? [];

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <PageHeader
        title="Route history"
        description="Journeys you have saved, with the prediction context each one was calculated under."
        actions={
          entries.length > 0 &&
          (confirmClear ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-500 dark:text-ink-400">Clear everything?</span>
              <Button variant="danger" size="sm" onClick={clearAll}>
                Yes, clear
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmClear(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" icon={Trash2} onClick={() => setConfirmClear(true)}>
              Clear history
            </Button>
          ))
        }
      />

      {/* --------------------------------------------------------- Summary */}
      {stats.loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : stats.data?.trips > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Journeys saved" value={stats.data.trips} icon={RouteIcon} />
          <StatTile
            label="Distance planned"
            value={stats.data.totalDistanceKm}
            unit="km"
            icon={MapPin}
            tone="neutral"
          />
          <StatTile
            label="Time planned"
            value={formatDuration(stats.data.totalDurationMinutes)}
            icon={Timer}
            tone="warning"
          />
          <StatTile
            label="Took the recommendation"
            value={`${stats.data.recommendedTaken}/${stats.data.trips}`}
            icon={Sparkles}
            tone="success"
            hint={
              stats.data.averageSpeedKmh
                ? `Average ${formatSpeed(stats.data.averageSpeedKmh)}`
                : undefined
            }
          />
        </div>
      ) : null}

      {/* ---------------------------------------------------------- Entries */}
      {list.loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <EmptyState
            icon={Bookmark}
            title="No routes yet"
            description="Start your first Smart Journey and save it — your saved routes and the conditions they were planned under will appear here."
            action={
              <Button to="/app/navigate" icon={Compass}>
                Start your smart journey
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Card className="animate-fade-up p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <TrafficBadge level={entry.trafficLevel} />
                      {entry.wasRecommended && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                          <Sparkles className="size-2.5" aria-hidden />
                          Recommended
                        </span>
                      )}
                      <span className="text-[11px] text-ink-400">
                        {relativeTime(entry.createdAt)}
                      </span>
                    </div>

                    <p className="mt-2 truncate text-base font-medium text-ink-900 dark:text-ink-50">
                      {entry.origin.name ?? 'Start'} → {entry.destination.name ?? 'Destination'}
                    </p>

                    <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500 dark:text-ink-400">
                      <div className="flex items-center gap-1.5">
                        <RouteIcon className="size-3.5" aria-hidden />
                        {formatDistance(entry.distanceKm)}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Timer className="size-3.5" aria-hidden />
                        {formatDuration(entry.durationMinutes)}
                      </div>
                      {entry.meanSpeedKmh && (
                        <div className="flex items-center gap-1.5">
                          <Gauge className="size-3.5" aria-hidden />
                          {formatSpeed(entry.meanSpeedKmh)}
                        </div>
                      )}
                      {entry.context?.hour != null && (
                        <div className="flex items-center gap-1.5">
                          <Timer className="size-3.5" aria-hidden />
                          Planned for {hourLabel(entry.context.hour)}
                          {entry.context.dayLabel ? ` · ${entry.context.dayLabel}` : ''}
                        </div>
                      )}
                    </dl>

                    {entry.explanationHeadline && (
                      <p className="mt-2.5 line-clamp-2 rounded-lg bg-ink-50 p-2.5 text-[11px] leading-relaxed text-ink-600 dark:bg-ink-900/60 dark:text-ink-300">
                        {entry.explanationHeadline}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      as={Link}
                      to={`/app/navigate?from=${entry.origin.lon},${entry.origin.lat}&fromName=${encodeURIComponent(entry.origin.name ?? 'Start')}&to=${entry.destination.lon},${entry.destination.lat}&toName=${encodeURIComponent(entry.destination.name ?? 'Destination')}`}
                      variant="outline"
                      size="sm"
                      icon={Repeat}
                    >
                      Search again
                    </Button>
                    <button
                      type="button"
                      onClick={() => remove(entry.id)}
                      disabled={deleting === entry.id}
                      aria-label="Delete this saved route"
                      className="rounded-lg p-2 text-ink-400 transition hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                </div>

                <p className="mt-3 border-t border-ink-200/60 pt-2.5 text-[10px] text-ink-400 dark:border-white/8">
                  Saved with a {entry.trafficDataType} prediction
                  {entry.context?.weatherSource ? ` · weather from ${entry.context.weatherSource}` : ''}
                  . Re-run the search for current conditions.
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
