import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  Calendar,
  CloudRain,
  Flame,
  Gauge,
  Timer,
  TrendingDown,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { DAY_NAMES, cn, formatSpeed, hourLabel, trafficStyle } from '../lib/format.js';
import { useAsync } from '../hooks/index.js';
import { useTheme } from '../context/ThemeContext.jsx';
import { MapView, TrafficLegend } from '../components/map/MapView.jsx';
import {
  Card,
  CardHeader,
  ErrorState,
  PageHeader,
  SectionTitle,
  Skeleton,
  StatTile,
  TrafficBadge,
} from '../components/ui/index.jsx';

export default function TrafficPage() {
  const [hour, setHour] = useState(() => new Date().getHours());
  const [dayOfWeek, setDayOfWeek] = useState(() => (new Date().getDay() + 6) % 7);
  const [rain, setRain] = useState(null);
  const [segments, setSegments] = useState([]);
  const [truncated, setTruncated] = useState(false);
  const viewportRef = useRef(null);
  const { isDark } = useTheme();

  const requestBody = useMemo(
    () => ({
      hour,
      day_of_week: dayOfWeek,
      use_live_weather: false,
      ...(rain != null ? { weather: { precipitation_mm: rain } } : {}),
    }),
    [dayOfWeek, hour, rain],
  );

  const {
    data: snapshot,
    loading,
    error,
    retry,
  } = useAsync(
    (options) => api.traffic.snapshot(requestBody, options),
    [requestBody],
  );

  const loadSegments = useCallback(
    async (viewport) => {
      if (!viewport) return;
      viewportRef.current = viewport;
      try {
        const result = await api.traffic.segments({
          ...requestBody,
          min_lon: viewport.min_lon,
          min_lat: viewport.min_lat,
          max_lon: viewport.max_lon,
          max_lat: viewport.max_lat,
          min_road_class: viewport.zoom >= 15 ? 0.35 : viewport.zoom >= 13 ? 0.5 : 0.7,
          limit: 1500,
        });
        setSegments(result.segments ?? []);
        setTruncated(Boolean(result.truncated));
      } catch {
        setSegments([]);
      }
    },
    [requestBody],
  );

  const axisColor = isDark ? '#7089ad' : '#4f6b91';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <ErrorState
          title="Traffic data unavailable"
          message={error.message}
          onRetry={retry}
          className="panel"
        />
      </div>
    );
  }

  const overall = snapshot?.overall;
  const outlook = snapshot?.hourly_outlook ?? [];
  const peakHour = outlook.reduce(
    (worst, item) => (!worst || item.speed_retention < worst.speed_retention ? item : worst),
    null,
  );

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <PageHeader
        title="Traffic intelligence"
        description="Predicted congestion across the whole Mogadishu network, for any hour of any day."
      />

      {/* ------------------------------------------------------- Time controls */}
      <Card className="p-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="traffic-hour" className="text-xs font-medium text-ink-600 dark:text-ink-300">
                Time of day
              </label>
              <span className="font-mono text-sm font-semibold text-brand-600 dark:text-brand-400">
                {hourLabel(hour)}
              </span>
            </div>
            <input
              id="traffic-hour"
              type="range"
              min={0}
              max={23}
              value={hour}
              onChange={(event) => setHour(Number(event.target.value))}
              className="w-full accent-brand-600"
            />
            <div className="mt-1 flex justify-between text-[10px] text-ink-400">
              <span>00:00</span>
              <span>06:00</span>
              <span>12:00</span>
              <span>18:00</span>
              <span>23:00</span>
            </div>
          </div>

          <div>
            <label
              htmlFor="traffic-day"
              className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-600 dark:text-ink-300"
            >
              <Calendar className="size-3.5" aria-hidden />
              Day
            </label>
            <select
              id="traffic-day"
              value={dayOfWeek}
              onChange={(event) => setDayOfWeek(Number(event.target.value))}
              className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-800 focus:border-brand-500 focus:outline-none sm:w-44 dark:border-white/10 dark:bg-ink-900 dark:text-ink-100"
            >
              {DAY_NAMES.map((name, index) => (
                <option key={name} value={index}>
                  {name}
                  {index === 4 ? ' (rest day)' : ''}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setRain(rain == null ? 8 : null)}
            aria-pressed={rain != null}
            className={cn(
              'flex h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium transition',
              rain != null
                ? 'border-somali-500 bg-somali-500/12 text-somali-600 dark:text-somali-400'
                : 'border-ink-200 text-ink-600 hover:bg-ink-50 dark:border-white/10 dark:text-ink-300 dark:hover:bg-white/6',
            )}
          >
            <CloudRain className="size-4" aria-hidden />
            Heavy rain
          </button>
        </div>
      </Card>

      {/* ------------------------------------------------------------- Stats */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Network status"
            value={trafficStyle(overall.level).label}
            icon={Activity}
            tone={overall.level === 'LOW' ? 'success' : overall.level === 'HIGH' ? 'danger' : 'warning'}
            hint={`Holding ${(overall.speed_retention * 100).toFixed(0)}% of free-flow speed`}
          />
          <StatTile
            label="Mean speed"
            value={overall.mean_speed_kmh}
            unit="km/h"
            icon={Gauge}
            hint={`Free-flow reference ${formatSpeed(overall.free_flow_speed_kmh)}`}
          />
          <StatTile
            label="Added travel time"
            value={`+${(overall.delay_share * 100).toFixed(0)}`}
            unit="%"
            icon={Timer}
            tone="warning"
            hint="Versus the same network running free-flow"
          />
          <StatTile
            label="Busiest hour today"
            value={peakHour ? hourLabel(peakHour.hour) : '—'}
            icon={Flame}
            tone="danger"
            hint={peakHour ? `${formatSpeed(peakHour.mean_speed_kmh)} network average` : undefined}
          />
        </div>
      )}

      {/* ---------------------------------------------------------- Map + charts */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="relative overflow-hidden lg:col-span-3">
          <MapView
            className="h-[26rem] w-full lg:h-[32rem]"
            trafficSegments={segments}
            showTraffic
            hotspots={snapshot?.hotspots ?? []}
            onViewportChange={loadSegments}
          />
          <TrafficLegend className="absolute bottom-4 left-4 z-[600]" truncated={truncated} />
        </Card>

        <div className="space-y-4 lg:col-span-2">
          {/* Hourly outlook */}
          <Card className="p-4">
            <CardHeader
              icon={Activity}
              title="Congestion through the day"
              description={`Network-wide predicted speed on ${DAY_NAMES[dayOfWeek]}`}
            />
            <div className="mt-4 h-44">
              {loading ? (
                <Skeleton className="size-full rounded-xl" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={outlook} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                    <defs>
                      <linearGradient id="speedFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#06a6ec" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#06a6ec" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={gridColor} vertical={false} />
                    <XAxis
                      dataKey="hour"
                      tick={{ fontSize: 10, fill: axisColor }}
                      tickLine={false}
                      axisLine={false}
                      ticks={[0, 6, 12, 18, 23]}
                      tickFormatter={hourLabel}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: axisColor }}
                      tickLine={false}
                      axisLine={false}
                      domain={['dataMin - 2', 'dataMax + 2']}
                    />
                    <Tooltip content={<ChartTooltip unit=" km/h" dataKey="mean_speed_kmh" />} />
                    <Area
                      type="monotone"
                      dataKey="mean_speed_kmh"
                      stroke="#06a6ec"
                      strokeWidth={2}
                      fill="url(#speedFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">
              Selected hour {hourLabel(hour)} is marked in the outlook data. Friday follows a
              different curve — a midday Jumca movement rather than commuter peaks.
            </p>
          </Card>

          {/* Distribution */}
          <Card className="p-4">
            <CardHeader
              icon={TrendingDown}
              title="Where the network sits"
              description="Share of road length at each congestion level"
            />
            {loading ? (
              <Skeleton className="mt-4 h-28 rounded-xl" />
            ) : (
              <div className="mt-4 space-y-3">
                {snapshot.distribution.map((row) => {
                  const style = trafficStyle(row.level);
                  return (
                    <div key={row.level}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 font-medium text-ink-700 dark:text-ink-200">
                          <span className={cn('size-2 rounded-full', style.dot)} aria-hidden />
                          {style.label}
                        </span>
                        <span className="tabular-nums text-ink-500 dark:text-ink-400">
                          {row.length_km.toLocaleString()} km · {(row.share * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-white/8">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.max(row.share * 100, row.share > 0 ? 1.5 : 0)}%`,
                            backgroundColor: style.color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>


    </div>
  );
}

function ChartTooltip({ active, payload, unit = '', dataKey }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="glass-strong rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-ink-800 dark:text-ink-100">
        {point.label ?? point.hour}
      </p>
      <p className="mt-0.5 tabular-nums text-ink-600 dark:text-ink-300">
        {point[dataKey]}
        {unit}
      </p>
      {point.level && (
        <p className="mt-0.5 text-[10px] text-ink-500">{trafficStyle(point.level).label} traffic</p>
      )}
    </div>
  );
}
