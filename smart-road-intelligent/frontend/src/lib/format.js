import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind-aware class joiner used by every component. */
export const cn = (...inputs) => twMerge(clsx(inputs));

export const TRAFFIC_LEVELS = {
  LOW: {
    label: 'Light',
    color: '#10b981',
    text: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-500/10 dark:bg-emerald-500/15',
    ring: 'ring-emerald-500/25',
    dot: 'bg-emerald-500',
  },
  MEDIUM: {
    label: 'Moderate',
    color: '#f59e0b',
    text: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-500/10 dark:bg-amber-500/15',
    ring: 'ring-amber-500/25',
    dot: 'bg-amber-500',
  },
  HIGH: {
    label: 'Heavy',
    color: '#ef4444',
    text: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-500/10 dark:bg-red-500/15',
    ring: 'ring-red-500/25',
    dot: 'bg-red-500',
  },
};

export const trafficStyle = (level) => TRAFFIC_LEVELS[level] ?? TRAFFIC_LEVELS.MEDIUM;

/** Minutes as "38 min" or "1 h 24 min". */
export function formatDuration(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return '--';
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function formatDistance(km) {
  if (km == null || Number.isNaN(km)) return '--';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 2 : 1)} km`;
}

export function formatSpeed(kmh) {
  return kmh == null || Number.isNaN(kmh) ? '--' : `${Math.round(kmh)} km/h`;
}

export const formatPercent = (ratio, digits = 0) =>
  ratio == null || Number.isNaN(ratio) ? '--' : `${(ratio * 100).toFixed(digits)}%`;

/**
 * Arrival clock time for a trip of `minutes` leaving at `departure`.
 *
 * `departure` matters: when the user plans ahead for 17:00, the arrival must be
 * based on that departure rather than the current time.
 */
export function arrivalTime(minutes, departure) {
  if (minutes == null) return '--';
  const base = departure ? new Date(departure) : new Date();
  if (Number.isNaN(base.getTime())) return '--';
  const at = new Date(base.getTime() + minutes * 60_000);
  return at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(value) {
  if (!value) return '--';
  return new Date(value).toLocaleString([], {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function relativeTime(value) {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return formatDateTime(value);
}

export const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/** Somali working week: Saturday through Thursday, with Friday as the rest day. */
export const WEEK_ORDER = [5, 6, 0, 1, 2, 3, 4];

export const hourLabel = (hour) => `${String(hour).padStart(2, '0')}:00`;

/** [lon, lat] pairs from the API to Leaflet's [lat, lon]. */
export const toLatLngs = (coordinates = []) => coordinates.map(([lon, lat]) => [lat, lon]);

export function boundsOf(coordinates = []) {
  if (!coordinates.length) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const [lon, lat] of coordinates) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  return [
    [minLat, minLon],
    [maxLat, maxLon],
  ];
}

export const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || 'SR';
