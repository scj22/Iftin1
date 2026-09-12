import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowUpDown,
  Bookmark,
  Calendar,
  Car,
  Clock,
  CloudRain,
  Compass,
  Crosshair,
  Footprints,
  ListTree,
  MapPin,
  Navigation as NavIcon,
  Route as RouteIcon,
  Search,
  Sparkles,
  Table2,
} from 'lucide-react';
import { api, ApiError } from '../lib/api.js';
import { DAY_NAMES, boundsOf, cn, hourLabel } from '../lib/format.js';
import { DEMO_SCENARIO } from '../lib/constants.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useGeolocation } from '../hooks/index.js';
import { useServiceStatus } from '../components/layout/ServiceStatus.jsx';
import { MapView, TrafficLegend } from '../components/map/MapView.jsx';
import { PlaceSearch } from '../components/route/PlaceSearch.jsx';
import { RouteCard } from '../components/route/RouteCard.jsx';
import {
  Explanation,
  RouteComparison,
  RouteSteps,
} from '../components/route/Explanation.jsx';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Skeleton,
  SkeletonText,
} from '../components/ui/index.jsx';

const TABS = [
  { id: 'routes', label: 'Routes', icon: RouteIcon },
  { id: 'compare', label: 'Compare', icon: Table2 },
];

export default function NavigatePage() {
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const { isAuthenticated } = useAuth();
  const { aiReachable, capabilities } = useServiceStatus();
  const geo = useGeolocation();

  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [pickTarget, setPickTarget] = useState(null);

  const [travelMode, setTravelMode] = useState('driving');

  const [hour, setHour] = useState(() => new Date().getHours());
  const [dayOfWeek, setDayOfWeek] = useState(() => (new Date().getDay() + 6) % 7);
  const [useNow, setUseNow] = useState(true);
  const [rainOverride, setRainOverride] = useState(null);

  const [plan, setPlan] = useState(null);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState(null);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [activeTab, setActiveTab] = useState('routes');

  const [showTraffic, setShowTraffic] = useState(false);
  const [trafficSegments, setTrafficSegments] = useState([]);
  const [trafficTruncated, setTrafficTruncated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState(null);

  const viewportRef = useRef(null);
  const requestRef = useRef(0);
  const appliedLinkRef = useRef(null);

  const routes = plan?.routes ?? [];
  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? routes[0] ?? null;

  /* -------------------------------------------------------------- planning */

  const runPlan = useCallback(
    async (from, to, options = {}) => {
      if (!from || !to) return;

      const requestId = ++requestRef.current;
      setPlanning(true);
      setPlanError(null);
      setSavedId(null);

      const activeMode = options.travelMode ?? travelMode;

      const body = {
        origin: { lon: from.lon, lat: from.lat },
        destination: { lon: to.lon, lat: to.lat },
        alternatives: 2,
        mode: activeMode,
        travel_mode: activeMode,
        use_live_weather: options.useNow ?? useNow,
      };
      if (!(options.useNow ?? useNow)) {
        body.hour = options.hour ?? hour;
        body.day_of_week = options.dayOfWeek ?? dayOfWeek;
      }
      const rain = options.rain === undefined ? rainOverride : options.rain;
      if (rain != null) body.weather = { precipitation_mm: rain };

      try {
        let result = await api.navigation.plan(body);
        if (requestRef.current !== requestId) return; // superseded

        // 🚶 Recalculate duration & completely strip traffic/congestion for walking mode
        if (activeMode === 'walking' && result?.routes) {
          const WALKING_SPEED_KMH = 4.8; // Average walking speed ~4.8 km/h

          result = {
            ...result,
            routes: result.routes.map((route) => {
              const walkingMinutes = Math.max(
                1,
                Math.round((route.distance_km / WALKING_SPEED_KMH) * 60),
              );
              return {
                ...route,
                duration_minutes: walkingMinutes,
                mean_speed_kmh: WALKING_SPEED_KMH,
                traffic_level: null,            // Removes traffic level badge
                congestion_delay_min: null,     // Removes congestion delay callouts
                congestion_delay_minutes: 0,
                congestion_delay: 0,
              };
            }),
          };

          if (result.explanation) {
            result.explanation = {
              ...result.explanation,
              headline: `Recommended walking route based on distance and road conditions on foot.`,
            };
          }
        }

        setPlan(result);
        setSelectedRouteId(result.recommended_route_id);
        setActiveTab('routes');
      } catch (error) {
        if (requestRef.current !== requestId) return;
        setPlan(null);
        setPlanError(error);
        if (!(error instanceof ApiError) || error.status !== 422) {
          toast.error(error.message);
        }
      } finally {
        if (requestRef.current === requestId) setPlanning(false);
      }
    },
    [dayOfWeek, hour, rainOverride, toast, travelMode, useNow],
  );

  const handleModeChange = (newMode) => {
    setTravelMode(newMode);
    if (origin && destination) {
      runPlan(origin, destination, { travelMode: newMode });
    }
  };

  /* ------------------------------------------------------------ deep links */

  useEffect(() => {
    if (!aiReachable) return;

    const signature = searchParams.toString();
    if (appliedLinkRef.current === signature) return;
    appliedLinkRef.current = signature;

    if (searchParams.get('demo') === '1') {
      startDemo();
      return;
    }

    const from = parsePoint(searchParams.get('from'), searchParams.get('fromName'));
    const to = parsePoint(searchParams.get('to'), searchParams.get('toName'));
    if (from && to) {
      setOrigin(from);
      setDestination(to);
      setUseNow(true);
      runPlan(from, to, { useNow: true });
    }
  }, [searchParams, aiReachable]);

  /* ---------------------------------------------------------- map traffic */

  const loadTrafficForView = useCallback(
    async (viewport) => {
      if (!viewport || !showTraffic) return;
      try {
        const result = await api.traffic.segments({
          ...viewport,
          zoom: undefined,
          min_road_class: viewport.zoom >= 15 ? 0.35 : viewport.zoom >= 13 ? 0.5 : 0.7,
          limit: 1200,
          use_live_weather: useNow,
          ...(useNow ? {} : { hour, day_of_week: dayOfWeek }),
          ...(rainOverride != null ? { weather: { precipitation_mm: rainOverride } } : {}),
        });
        setTrafficSegments(result.segments ?? []);
        setTrafficTruncated(Boolean(result.truncated));
      } catch {
        setTrafficSegments([]);
      }
    },
    [dayOfWeek, hour, rainOverride, showTraffic, useNow],
  );

  useEffect(() => {
    if (showTraffic) loadTrafficForView(viewportRef.current);
    else setTrafficSegments([]);
  }, [showTraffic, loadTrafficForView]);

  const onViewportChange = useCallback(
    (viewport) => {
      viewportRef.current = viewport;
      loadTrafficForView(viewport);
    },
    [loadTrafficForView],
  );

  /* ---------------------------------------------------------------- actions */

  const useMyLocation = async () => {
    const found = await geo.locate();
    if (found) {
      const point = { name: 'My location', lon: found.lon, lat: found.lat };
      setOrigin(point);
      if (destination) runPlan(point, destination);
      toast.success('Using your current location as the starting point.');
    } else if (geo.error) {
      toast.warning(geo.error);
    }
  };

  const onMapClick = useCallback(
    async ({ lon, lat }) => {
      if (!pickTarget) return;
      try {
        const snapped = await api.navigation.snap({ lon, lat });
        const point = {
          name: snapped.nearest_place
            ? `Near ${snapped.nearest_place.name}`
            : `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
          lon: snapped.lon,
          lat: snapped.lat,
          snapOffsetM: snapped.snap_offset_m,
        };

        if (!snapped.in_coverage) {
          toast.warning(
            `That point is ${Math.round(snapped.snap_offset_m)} m from the nearest mapped road. Routing will start from the closest road.`,
          );
        }

        if (pickTarget === 'origin') {
          setOrigin(point);
          if (destination) runPlan(point, destination);
        } else {
          setDestination(point);
          if (origin) runPlan(origin, point);
        }
        setPickTarget(null);
      } catch (error) {
        toast.error(error.message);
      }
    },
    [destination, origin, pickTarget, runPlan, toast],
  );

  const swap = () => {
    setOrigin(destination);
    setDestination(origin);
    if (origin && destination) runPlan(destination, origin);
  };

  function startDemo() {
    const from = { ...DEMO_SCENARIO.origin };
    const to = { ...DEMO_SCENARIO.destination };
    setOrigin(from);
    setDestination(to);
    setUseNow(false);
    setHour(DEMO_SCENARIO.hour);
    setDayOfWeek(DEMO_SCENARIO.dayOfWeek);
    setRainOverride(null);
    runPlan(from, to, {
      useNow: false,
      hour: DEMO_SCENARIO.hour,
      dayOfWeek: DEMO_SCENARIO.dayOfWeek,
      rain: null,
    });
    toast.info(DEMO_SCENARIO.caption, { title: 'Demo scenario', duration: 8000 });
  }

  const saveRoute = async () => {
    if (!selectedRoute || !plan) return;
    setSaving(true);
    try {
      const { entry } = await api.history.save({
        origin: { name: origin.name, lon: origin.lon, lat: origin.lat },
        destination: { name: destination.name, lon: destination.lon, lat: destination.lat },
        selectedRouteId: selectedRoute.id,
        selectedRouteName: selectedRoute.name,
        wasRecommended: selectedRoute.is_recommended,
        distanceKm: selectedRoute.distance_km,
        durationMinutes: selectedRoute.duration_minutes,
        meanSpeedKmh: selectedRoute.mean_speed_kmh,
        trafficLevel: selectedRoute.traffic_level,
        speedRetention: selectedRoute.speed_retention,
        roadQualityScore: selectedRoute.road_quality_score,
        routeScore: selectedRoute.score,
        alternativeCount: Math.max(0, routes.length - 1),
        context: {
          hour: plan.context.hour,
          dayOfWeek: plan.context.day_of_week,
          dayLabel: plan.context.day_label,
          weatherCondition: plan.context.weather.condition,
          precipitationMm: plan.context.weather.precipitation_mm,
          weatherSource: plan.context.weather.source,
        },
        explanationHeadline: plan.explanation.headline,
        geometry: selectedRoute.geometry,
      });
      setSavedId(entry.id);
      toast.success('Route saved to your history.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const fitBounds = useMemo(
    () => (selectedRoute ? boundsOf(selectedRoute.geometry.coordinates) : null),
    [selectedRoute],
  );

  const canPlan = origin && destination && aiReachable;

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* ------------------------------------------------------ Control panel */}
      <div className="order-2 flex w-full shrink-0 flex-col overflow-y-auto border-t border-ink-200/70 bg-ink-50 lg:order-1 lg:w-[26rem] lg:border-r lg:border-t-0 dark:border-white/8 dark:bg-ink-950">
        <div className="space-y-4 p-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
              Where do you want to go?
            </h1>
            <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
              Pick two points in Mogadishu and Smart Road compares the real road corridors between
              them.
            </p>
          </div>

          {/* Origin / destination */}
          <div className="relative space-y-3">
            <PlaceSearch
              label="From"
              placeholder="Search a starting point"
              icon={Compass}
              value={origin}
              onSelect={(point) => {
                setOrigin(point);
                if (destination) runPlan(point, destination);
              }}
              onClear={() => setOrigin(null)}
              extraAction={
                <button
                  type="button"
                  onClick={useMyLocation}
                  disabled={geo.isLocating}
                  title="Use my location"
                  aria-label="Use my location"
                  className="rounded-lg p-1.5 text-brand-600 transition hover:bg-brand-500/10 disabled:opacity-60 dark:text-brand-400"
                >
                  <Crosshair className={cn('size-4', geo.isLocating && 'animate-spin')} aria-hidden />
                </button>
              }
            />

            <PlaceSearch
              label="To"
              placeholder="Search a destination"
              icon={MapPin}
              accent="sand"
              value={destination}
              onSelect={(point) => {
                setDestination(point);
                if (origin) runPlan(origin, point);
              }}
              onClear={() => setDestination(null)}
            />

            {origin && destination && (
              <button
                type="button"
                onClick={swap}
                aria-label="Swap origin and destination"
                className="absolute -right-1 top-1/2 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-full border border-ink-200 bg-white text-ink-500 shadow-sm transition hover:text-brand-600 dark:border-white/10 dark:bg-ink-850 dark:text-ink-400"
              >
                <ArrowUpDown className="size-3.5" aria-hidden />
              </button>
            )}
          </div>

          {/* Travel Mode Selector Buttons */}
          {destination && (
            <div className="space-y-1.5 animate-fade-in">
              <label className="text-[11px] font-medium text-ink-500 dark:text-ink-400">
                Travel Mode
              </label>
              <div className="flex gap-2 rounded-xl bg-ink-100 p-1 dark:bg-white/6">
                <button
                  type="button"
                  onClick={() => handleModeChange('driving')}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition',
                    travelMode === 'driving'
                      ? 'bg-white text-brand-600 shadow-sm dark:bg-ink-700 dark:text-brand-400'
                      : 'text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-white',
                  )}
                >
                  <Car className="size-4" aria-hidden />
                  By Car
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('walking')}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition',
                    travelMode === 'walking'
                      ? 'bg-white text-brand-600 shadow-sm dark:bg-ink-700 dark:text-brand-400'
                      : 'text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-white',
                  )}
                >
                  <Footprints className="size-4" aria-hidden />
                  On Foot
                </button>
              </div>
            </div>
          )}

          {/* Map-pick helpers */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant={pickTarget === 'origin' ? 'primary' : 'outline'}
              size="sm"
              icon={Compass}
              onClick={() => setPickTarget(pickTarget === 'origin' ? null : 'origin')}
            >
              {pickTarget === 'origin' ? 'Tap the map…' : 'Pick start on map'}
            </Button>
            <Button
              variant={pickTarget === 'destination' ? 'primary' : 'outline'}
              size="sm"
              icon={MapPin}
              onClick={() =>
                setPickTarget(pickTarget === 'destination' ? null : 'destination')
              }
            >
              {pickTarget === 'destination' ? 'Tap the map…' : 'Pick end on map'}
            </Button>
          </div>

          {/* Departure context */}
          <div className="panel space-y-3 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-medium text-ink-700 dark:text-ink-200">
                <Clock className="size-3.5 text-ink-400" aria-hidden />
                Departure
              </span>
              <div className="flex rounded-lg bg-ink-100 p-0.5 dark:bg-white/6">
                <button
                  type="button"
                  onClick={() => setUseNow(true)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[11px] font-medium transition',
                    useNow
                      ? 'bg-white text-brand-600 shadow-sm dark:bg-ink-700 dark:text-brand-400'
                      : 'text-ink-500 dark:text-ink-400',
                  )}
                >
                  Now
                </button>
                <button
                  type="button"
                  onClick={() => setUseNow(false)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[11px] font-medium transition',
                    !useNow
                      ? 'bg-white text-brand-600 shadow-sm dark:bg-ink-700 dark:text-brand-400'
                      : 'text-ink-500 dark:text-ink-400',
                  )}
                >
                  Plan ahead
                </button>
              </div>
            </div>

            {!useNow && (
              <div className="animate-fade-in space-y-3">
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label htmlFor="hour" className="text-[11px] text-ink-500 dark:text-ink-400">
                      Time of day
                    </label>
                    <span className="font-mono text-xs font-medium text-ink-800 dark:text-ink-100">
                      {hourLabel(hour)}
                    </span>
                  </div>
                  <input
                    id="hour"
                    type="range"
                    min={0}
                    max={23}
                    value={hour}
                    onChange={(event) => setHour(Number(event.target.value))}
                    className="w-full accent-brand-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="day"
                    className="mb-1.5 flex items-center gap-1.5 text-[11px] text-ink-500 dark:text-ink-400"
                  >
                    <Calendar className="size-3" aria-hidden />
                    Day
                  </label>
                  <select
                    id="day"
                    value={dayOfWeek}
                    onChange={(event) => setDayOfWeek(Number(event.target.value))}
                    className="h-9 w-full rounded-lg border border-ink-200 bg-white px-2.5 text-xs text-ink-800 focus:border-brand-500 focus:outline-none dark:border-white/10 dark:bg-ink-900 dark:text-ink-100"
                  >
                    {DAY_NAMES.map((name, index) => (
                      <option key={name} value={index}>
                        {name}
                        {index === 4 ? ' (rest day)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <label className="flex cursor-pointer items-center gap-2.5 rounded-lg bg-ink-100/60 px-2.5 py-2 dark:bg-white/5">
              <input
                type="checkbox"
                checked={rainOverride != null}
                onChange={(event) => setRainOverride(event.target.checked ? 8 : null)}
                className="size-3.5 accent-brand-600"
              />
              <CloudRain className="size-3.5 text-somali-500" aria-hidden />
              <span className="text-[11px] text-ink-600 dark:text-ink-300">
                Model heavy rain (8 mm/h)
              </span>
            </label>
          </div>

          <div className="flex gap-2">
            <Button
              icon={Search}
              loading={planning}
              disabled={!canPlan}
              onClick={() => runPlan(origin, destination)}
              className="flex-1"
            >
              {planning ? 'Analysing routes…' : 'Find best route'}
            </Button>
          </div>

          {!aiReachable && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
              The AI service is offline, so routes cannot be calculated right now.
            </p>
          )}
        </div>

        {/* ------------------------------------------------------------ Results */}
        <div className="min-h-0 flex-1 border-t border-ink-200/70 dark:border-white/8">
          {planning && <PlanningSkeleton />}

          {!planning && planError && (
            <ErrorState
              title={planError.status === 422 ? 'No route between those points' : 'Could not plan a route'}
              message={planError.message}
              onRetry={canPlan ? () => runPlan(origin, destination) : undefined}
            />
          )}

          {!planning && !planError && !plan && (
            <EmptyState
              icon={NavIcon}
              title="No routes yet"
              description="Choose a start and destination, then Smart Road will compare the real road corridors between them and explain its pick."
              action={
                <Button variant="subtle" icon={Sparkles} onClick={startDemo}>
                  Start your smart journey
                </Button>
              }
            />
          )}

          {!planning && plan && (
            <div className="animate-fade-up space-y-4 p-4">
              {/* Context strip */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral" icon={Clock}>
                  {hourLabel(plan.context.hour)} · {plan.context.day_label}
                </Badge>
                <Badge tone="neutral" icon={CloudRain}>
                  {plan.context.weather.condition}
                </Badge>
              </div>

              {/* Tabs */}
              <div
                role="tablist"
                className="flex rounded-xl bg-ink-100 p-1 dark:bg-white/6"
              >
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      role="tab"
                      type="button"
                      aria-selected={activeTab === tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition',
                        activeTab === tab.id
                          ? 'bg-white text-brand-600 shadow-sm dark:bg-ink-700 dark:text-brand-400'
                          : 'text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-white',
                      )}
                    >
                      <Icon className="size-3.5" aria-hidden />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {activeTab === 'routes' && (
                <div className="animate-fade-in space-y-3">
                  {routes.map((route, index) => (
                    <RouteCard
                      key={route.id}
                      route={route}
                      index={index}
                      selected={route.id === selectedRouteId}
                      onSelect={setSelectedRouteId}
                      departure={plan.planned_for}
                    />
                  ))}

                  {routes.length === 1 && (
                    <p className="rounded-lg bg-ink-100/70 px-3 py-2 text-[11px] leading-relaxed text-ink-500 dark:bg-white/5 dark:text-ink-400">
                      Only one distinct corridor exists between these points in the prepared
                      network — alternatives that overlapped it too heavily were discarded rather
                      than padded out.
                    </p>
                  )}

                  <Explanation explanation={plan.explanation} scoring={plan.scoring} />

                  {isAuthenticated && capabilities.routeHistory && (
                    <Button
                      variant={savedId ? 'secondary' : 'outline'}
                      icon={Bookmark}
                      loading={saving}
                      disabled={Boolean(savedId)}
                      onClick={saveRoute}
                      className="w-full"
                    >
                      {savedId ? 'Saved to your history' : 'Save this route'}
                    </Button>
                  )}
                </div>
              )}

              {activeTab === 'compare' && (
                <div className="panel animate-fade-in p-4">
                  <RouteComparison routes={routes} />
                  <p className="mt-3 text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">
                    {plan.scoring.description}
                  </p>
                </div>
              )}

              {activeTab === 'steps' && selectedRoute && (
                <div className="panel animate-fade-in p-4">
                  <p className="mb-3 text-xs text-ink-500 dark:text-ink-400">
                    {selectedRoute.steps.length} legs along {selectedRoute.name.toLowerCase()},
                    grouped by road class and surface.
                  </p>
                  <RouteSteps steps={selectedRoute.steps} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------------- Map */}
      <div className="relative order-1 min-h-[45vh] flex-1 lg:order-2 lg:min-h-0">
        <MapView
          className="size-full"
          routes={routes}
          selectedRouteId={selectedRouteId}
          onSelectRoute={setSelectedRouteId}
          origin={origin}
          destination={destination}
          userLocation={geo.position}
          trafficSegments={trafficSegments}
          showTraffic={showTraffic}
          onToggleTraffic={() => setShowTraffic((value) => !value)}
          onMapClick={pickTarget ? onMapClick : undefined}
          onViewportChange={onViewportChange}
          onLocate={useMyLocation}
          locating={geo.isLocating}
          fitBounds={fitBounds}
        />

        {pickTarget && (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-[600] flex justify-center px-4">
            <p className="glass-strong animate-fade-in rounded-full px-4 py-2 text-xs font-medium text-ink-800 shadow-lg dark:text-ink-100">
              Tap the map to set the {pickTarget === 'origin' ? 'starting point' : 'destination'}
            </p>
          </div>
        )}

        {showTraffic && (
          <TrafficLegend
            className="absolute bottom-6 left-3 z-[600]"
            truncated={trafficTruncated}
          />
        )}
      </div>
    </div>
  );
}

function PlanningSkeleton() {
  return (
    <div className="space-y-3 p-4" aria-busy="true">
      <div className="flex gap-2">
        <Skeleton className="h-6 w-32 rounded-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      {[0, 1, 2].map((index) => (
        <div key={index} className="panel space-y-3 p-4">
          <div className="flex justify-between">
            <Skeleton className="h-5 w-28 rounded-full" />
            <Skeleton className="h-5 w-10" />
          </div>
          <Skeleton className="h-7 w-40" />
          <div className="grid grid-cols-3 gap-2 pt-2">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        </div>
      ))}
      <div className="panel p-4">
        <SkeletonText lines={4} />
      </div>
    </div>
  );
}

function parsePoint(value, name) {
  if (!value) return null;
  const [lon, lat] = value.split(',').map(Number);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return { lon, lat, name: name || `${lat.toFixed(4)}, ${lon.toFixed(4)}` };
}