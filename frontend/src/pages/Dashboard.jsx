import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Clock,
  Compass,
  Gauge,
  Route as RouteIcon,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { hourLabel, trafficStyle } from '../lib/format.js';
import { useAsync } from '../hooks/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Button,
  Card,
  CardHeader,
  PageHeader,
  Skeleton,
  StatTile,
} from '../components/ui/index.jsx';

export default function Dashboard() {
  const { user } = useAuth();

  const { data: snapshot, loading: loadingTraffic } = useAsync(
    (options) => api.traffic.snapshot({ use_live_weather: true }, options),
    [],
  );
  const greeting = getGreeting();
  const overall = snapshot?.overall;

  return (
    <div className="space-y-4 p-3 sm:p-5">
      <PageHeader
        title={`${greeting}${user ? `, ${user.name.split(' ')[0]}` : ''}`}
        description="Predicted road conditions across Mogadishu right now, and everything you need to plan a journey."
        actions={<Button to="/app/navigate" icon={Compass}>Plan a journey</Button>}
      />

      {/* --------------------------------------------------------- Live strip */}
      <section aria-label="Current network conditions">
        {loadingTraffic ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatTile
              label="Network traffic"
              value={trafficStyle(overall.level).label}
              icon={Activity}
              tone={
                overall.level === 'LOW' ? 'success' : overall.level === 'HIGH' ? 'danger' : 'warning'
              }
              hint={`${hourLabel(snapshot.context.hour)} · ${snapshot.context.day_label}`}
            />
            <StatTile
              label="Mean speed"
              value={overall.mean_speed_kmh}
              unit="km/h"
              icon={Gauge}
              hint={`${(overall.speed_retention * 100).toFixed(0)}% of free-flow`}
            />
            <StatTile
              label="Weather"
              value={snapshot.context.weather.condition}
              icon={Clock}
              tone="neutral"
              hint={
                snapshot.context.weather.temperature_c != null
                  ? `${snapshot.context.weather.temperature_c.toFixed(0)} °C · ${snapshot.context.weather.source}`
                  : snapshot.context.weather.source
              }
              className="capitalize"
            />
          </div>
        )}

      </section>

      <div className="grid gap-3">
        {/* --------------------------------------------------------- Quick plan */}
        <Card className="p-4 lg:col-span-3">
          <CardHeader
            icon={Compass}
            title="Start a journey"
            description="Jump straight to a common trip, or open the full planner"
          />

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {QUICK_TRIPS.map((trip) => (
              <Link
                key={`${trip.from.name}-${trip.to.name}`}
                to={`/app/navigate?from=${trip.from.lon},${trip.from.lat}&fromName=${encodeURIComponent(trip.from.name)}&to=${trip.to.lon},${trip.to.lat}&toName=${encodeURIComponent(trip.to.name)}`}
                className="group flex items-center gap-2.5 rounded-xl border border-ink-200/70 p-2.5 transition-all hover:-translate-y-0.5 hover:border-brand-500/40 hover:shadow-md dark:border-white/8"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 transition group-hover:bg-brand-500 group-hover:text-white dark:text-brand-400">
                  <RouteIcon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink-800 dark:text-ink-100">
                    {trip.from.name}
                  </span>
                  <span className="block truncate text-xs text-ink-500 dark:text-ink-400">
                    to {trip.to.name}
                  </span>
                </span>
                <ArrowRight
                  className="size-4 shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500"
                  aria-hidden
                />
              </Link>
            ))}
          </div>

        </Card>

      </div>

    </div>
  );
}

const QUICK_TRIPS = [
  {
    from: { name: 'Aden Adde Airport', lon: 45.3047, lat: 2.0144 },
    to: { name: 'Bakara Market', lon: 45.3269, lat: 2.0469 },
  },
  {
    from: { name: 'Port of Mogadishu', lon: 45.3444, lat: 2.0208 },
    to: { name: 'KM4 Junction', lon: 45.3197, lat: 2.0397 },
  },
  {
    from: { name: 'Banadir Hospital', lon: 45.3242, lat: 2.0344 },
    to: { name: 'Mogadishu University', lon: 45.33, lat: 2.055 },
  },
  {
    from: { name: 'Lido Beach', lon: 45.3389, lat: 2.05 },
    to: { name: 'Wadajir District', lon: 45.295, lat: 2.01 },
  },
];

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
