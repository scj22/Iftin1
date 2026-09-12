import { Fragment, useEffect, useMemo, useRef } from 'react';
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Layers, Minus, Plus } from 'lucide-react';
import { MOGADISHU, ROUTE_COLORS, TILE_LAYER } from '../../lib/constants.js';
import { cn, toLatLngs, trafficStyle } from '../../lib/format.js';

/**
 * Leaflet's default marker icons resolve to bundler-broken URLs, so Smart Road
 * uses inline SVG divIcons throughout. They also theme with the app.
 */
function pinIcon({ color, glyph, pulse = false }) {
  return L.divIcon({
    className: 'smartroad-pin',
    html: `
      <div class="relative flex size-9 items-center justify-center">
        ${pulse ? '<span class="marker-pulse absolute inset-1"></span>' : ''}
        <svg viewBox="0 0 32 42" class="relative size-9 drop-shadow-md">
          <path d="M16 41C16 41 29 25.6 29 15.6 29 7.5 23.2 1 16 1S3 7.5 3 15.6C3 25.6 16 41 16 41Z"
                fill="${color}" stroke="white" stroke-width="2"/>
          <circle cx="16" cy="15.5" r="5.4" fill="white"/>
          <text x="16" y="19.4" text-anchor="middle" font-size="8" font-weight="700"
                fill="${color}" font-family="system-ui,sans-serif">${glyph}</text>
        </svg>
      </div>`,
    iconSize: [36, 42],
    iconAnchor: [18, 41],
    popupAnchor: [0, -38],
  });
}

export const ORIGIN_ICON = pinIcon({ color: '#06a6ec', glyph: 'A', pulse: true });
export const DESTINATION_ICON = pinIcon({ color: '#f0a01a', glyph: 'B' });

/** Fits the map to a geometry whenever it changes. */
function FitBounds({ bounds, padding = [60, 60] }) {
  const map = useMap();
  const previous = useRef(null);

  useEffect(() => {
    if (!bounds) return;
    const key = JSON.stringify(bounds);
    if (key === previous.current) return;
    previous.current = key;
    map.flyToBounds(bounds, { padding, duration: 0.7, maxZoom: 16 });
  }, [bounds, map, padding]);

  return null;
}

/** Reports viewport changes so callers can request only the visible segments. */
function ViewportReporter({ onChange }) {
  const map = useMapEvents({
    moveend: () => emit(),
    zoomend: () => emit(),
  });

  const emit = () => {
    if (!onChange) return;
    const bounds = map.getBounds();
    onChange({
      min_lon: bounds.getWest(),
      min_lat: bounds.getSouth(),
      max_lon: bounds.getEast(),
      max_lat: bounds.getNorth(),
      zoom: map.getZoom(),
    });
  };

  useEffect(() => {
    emit();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- emit on mount only
  }, []);

  return null;
}

/** Turns map clicks into coordinates for origin/destination picking. */
function ClickHandler({ onPick }) {
  useMapEvents({
    click: (event) => onPick?.({ lon: event.latlng.lng, lat: event.latlng.lat }),
  });
  return null;
}

function MapControls({ onLocate, locating, onToggleTraffic, trafficVisible }) {
  const map = useMap();

  const buttonClass =
    'grid size-10 place-items-center rounded-xl text-ink-600 transition hover:bg-ink-100 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-white/10 dark:hover:text-white';

  return (
    <div className="absolute right-3 top-3 z-[500] flex flex-col gap-2">
      <div className="glass-strong flex flex-col overflow-hidden rounded-xl">
        <button type="button" onClick={() => map.zoomIn()} className={buttonClass} aria-label="Zoom in">
          <Plus className="size-4.5" aria-hidden />
        </button>
        <span className="mx-2 h-px bg-ink-200/70 dark:bg-white/10" />
        <button type="button" onClick={() => map.zoomOut()} className={buttonClass} aria-label="Zoom out">
          <Minus className="size-4.5" aria-hidden />
        </button>
      </div>

      {onToggleTraffic && (
        <button
          type="button"
          onClick={onToggleTraffic}
          aria-pressed={trafficVisible}
          aria-label={trafficVisible ? 'Hide predicted traffic' : 'Show predicted traffic'}
          className={cn(
            'glass-strong grid size-10 place-items-center rounded-xl transition',
            trafficVisible
              ? 'text-brand-600 dark:text-brand-400'
              : 'text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-white',
          )}
        >
          <Layers className="size-4.5" aria-hidden />
        </button>
      )}

      {onLocate && (
        <button
          type="button"
          onClick={onLocate}
          disabled={locating}
          aria-label="Centre on my location"
          className="glass-strong grid size-10 place-items-center rounded-xl text-ink-600 transition hover:text-brand-600 disabled:opacity-60 dark:text-ink-300 dark:hover:text-brand-400"
        >
          <Crosshair className={cn('size-4.5', locating && 'animate-spin')} aria-hidden />
        </button>
      )}
    </div>
  );
}

/**
 * The shared map surface.
 *
 * Route polylines are drawn as a wide casing plus a coloured core so they stay
 * legible over both light and dark basemaps.
 */
export function MapView({
  routes = [],
  selectedRouteId,
  onSelectRoute,
  origin,
  destination,
  userLocation,
  trafficSegments = [],
  showTraffic = false,
  onToggleTraffic,
  hotspots = [],
  onMapClick,
  onViewportChange,
  onLocate,
  locating = false,
  fitBounds,
  className,
  children,
}) {
  const orderedRoutes = useMemo(
    // Draw the selected route last so it sits above the alternatives.
    () => [...routes].sort((a, b) => Number(a.id === selectedRouteId) - Number(b.id === selectedRouteId)),
    [routes, selectedRouteId],
  );

  return (
    <div className={cn('relative isolate overflow-hidden', className)}>
      <MapContainer
        center={MOGADISHU.center}
        zoom={MOGADISHU.zoom}
        minZoom={MOGADISHU.minZoom}
        maxZoom={MOGADISHU.maxZoom}
        maxBounds={MOGADISHU.maxBounds}
        maxBoundsViscosity={0.7}
        zoomControl={false}
        attributionControl
        preferCanvas
        className="size-full"
      >
        <TileLayer
          url={TILE_LAYER.url}
          attribution={TILE_LAYER.attribution}
          maxZoom={19}
          className="map-tiles-dark"
        />

        {onViewportChange && <ViewportReporter onChange={onViewportChange} />}
        {onMapClick && <ClickHandler onPick={onMapClick} />}
        <FitBounds bounds={fitBounds} />
        <MapControls
          onLocate={onLocate}
          locating={locating}
          onToggleTraffic={onToggleTraffic}
          trafficVisible={showTraffic}
        />

        {/* Predicted congestion, drawn beneath routes */}
        {showTraffic &&
          trafficSegments.map((segment, index) => (
            <Polyline
              key={`seg-${index}`}
              positions={toLatLngs(segment.coordinates)}
              pathOptions={{
                color: trafficStyle(segment.level).color,
                weight: 3.5,
                opacity: 0.75,
                lineCap: 'round',
              }}
            />
          ))}

        {hotspots.map((spot) => (
          <CircleMarker
            key={spot.id}
            center={[spot.lat, spot.lon]}
            radius={Math.min(22, 8 + spot.delay_minutes * 2.5)}
            pathOptions={{
              color: trafficStyle(spot.level).color,
              fillColor: trafficStyle(spot.level).color,
              fillOpacity: 0.22,
              weight: 1.5,
            }}
          >
            <Popup>
              <div className="min-w-44 space-y-1">
                <p className="text-sm font-semibold">{spot.dominant_road_class} corridor</p>
                <p className="text-xs text-ink-500">
                  {spot.length_km} km across {spot.segments} segments
                </p>
                <dl className="mt-2 space-y-0.5 text-xs">
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-500">Predicted delay</dt>
                    <dd className="font-medium">{spot.delay_minutes} min</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-500">Mean speed</dt>
                    <dd className="font-medium">{spot.mean_speed_kmh} km/h</dd>
                  </div>
                </dl>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Route casings */}
        {orderedRoutes.map((route) => {
          const isSelected = route.id === selectedRouteId;
          const index = routes.findIndex((item) => item.id === route.id);
          const color = route.is_recommended
            ? ROUTE_COLORS.recommended
            : ROUTE_COLORS.alternatives[(index - 1) % ROUTE_COLORS.alternatives.length];
          const positions = toLatLngs(route.geometry.coordinates);

          return (
            <Fragment key={route.id}>
              <Polyline
                positions={positions}
                pathOptions={{
                  color: '#ffffff',
                  weight: isSelected ? 10 : 7,
                  opacity: isSelected ? 0.85 : 0.5,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
              <Polyline
                positions={positions}
                className={isSelected ? 'route-line-recommended' : undefined}
                eventHandlers={{ click: () => onSelectRoute?.(route.id) }}
                pathOptions={{
                  color,
                  weight: isSelected ? 6 : 4,
                  opacity: isSelected ? 1 : 0.62,
                  dashArray: isSelected ? undefined : '10 8',
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
            </Fragment>
          );
        })}

        {userLocation && (
          <CircleMarker
            center={[userLocation.lat, userLocation.lon]}
            radius={8}
            pathOptions={{
              color: '#ffffff',
              fillColor: ROUTE_COLORS.recommended,
              fillOpacity: 1,
              weight: 3,
            }}
          >
            <Popup>Your current location</Popup>
          </CircleMarker>
        )}

        {origin && (
          <Marker position={[origin.lat, origin.lon]} icon={ORIGIN_ICON}>
            <Popup>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-400">From</p>
              <p className="text-sm font-semibold">{origin.name ?? 'Starting point'}</p>
            </Popup>
          </Marker>
        )}

        {destination && (
          <Marker position={[destination.lat, destination.lon]} icon={DESTINATION_ICON}>
            <Popup>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-400">To</p>
              <p className="text-sm font-semibold">{destination.name ?? 'Destination'}</p>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {children}
    </div>
  );
}

/** Fixed legend for the traffic colour scale. */
export function TrafficLegend({ className, truncated = false }) {
  return (
    <div className={cn('glass-strong rounded-xl px-3 py-2.5', className)}>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
        Predicted congestion
      </p>
      <div className="flex items-center gap-3">
        {['LOW', 'MEDIUM', 'HIGH'].map((level) => {
          const style = trafficStyle(level);
          return (
            <span key={level} className="flex items-center gap-1.5">
              <span
                className="h-1 w-5 rounded-full"
                style={{ backgroundColor: style.color }}
                aria-hidden
              />
              <span className="text-[11px] text-ink-600 dark:text-ink-300">{style.label}</span>
            </span>
          );
        })}
      </div>
      {truncated && (
        <p className="mt-1.5 text-[10px] leading-tight text-ink-400">
          Showing major roads in view only
        </p>
      )}
    </div>
  );
}
