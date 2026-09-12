import { useEffect, useId, useRef, useState } from 'react';
import { Building2, Crosshair, Globe, Loader2, MapPin, Search, X } from 'lucide-react';
import { usePlaceSearch } from '../../hooks/index.js';
import { cn } from '../../lib/format.js';

const CATEGORY_ICON = {
  transport: Building2,
  market: Building2,
  health: Building2,
  education: Building2,
  government: Building2,
  district: MapPin,
  junction: Crosshair,
  road: MapPin,
  leisure: MapPin,
  osm: Globe,
};

/**
 * Destination search with a combobox pattern: results are keyboard navigable and
 * each option states where it came from, so an OpenStreetMap hit is visibly
 * different from a built-in landmark anchor.
 */
export function PlaceSearch({
  label,
  placeholder,
  value,
  onSelect,
  onClear,
  icon: Icon = Search,
  accent = 'brand',
  extraAction,
  disabled,
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listId = useId();

  const { results, loading, sources } = usePlaceSearch(query, { enabled: open && !disabled });

  // Close when focus or a click leaves the combobox.
  useEffect(() => {
    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  useEffect(() => setActiveIndex(-1), [results]);

  const choose = (place) => {
    onSelect({
      name: place.name,
      lon: place.lon,
      lat: place.lat,
      district: place.district,
      source: place.source,
      snapOffsetM: place.snap_offset_m,
    });
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (event) => {
    if (!open || !results.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      choose(results[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const accentClass =
    accent === 'sand'
      ? 'text-sand-600 dark:text-sand-400'
      : 'text-brand-600 dark:text-brand-400';

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-500 dark:text-ink-400">
        {label}
      </label>

      {value ? (
        <div
          className={cn(
            'flex items-center gap-2.5 rounded-xl border border-ink-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-ink-900',
          )}
        >
          <Icon className={cn('size-4.5 shrink-0', accentClass)} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink-900 dark:text-ink-50">
              {value.name}
            </p>
            <p className="truncate text-[11px] text-ink-500 dark:text-ink-400">
              {value.district ? `${value.district} · ` : ''}
              {value.lat.toFixed(4)}, {value.lon.toFixed(4)}
              {value.snapOffsetM > 25 && ` · snapped ${Math.round(value.snapOffsetM)} m to road`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {extraAction}
            <button
              type="button"
              onClick={onClear}
              aria-label={`Clear ${label}`}
              className="rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-white/10"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      ) : (
        <div className="relative">
          <Icon
            className={cn(
              'pointer-events-none absolute left-3 top-1/2 size-4.5 -translate-y-1/2',
              accentClass,
            )}
            aria-hidden
          />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
            value={query}
            disabled={disabled}
            placeholder={placeholder}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            className="h-11 w-full rounded-xl border border-ink-200 bg-white pl-10 pr-10 text-sm text-ink-900 transition placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-60 dark:border-white/10 dark:bg-ink-900 dark:text-ink-50"
          />
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {loading && <Loader2 className="size-4 animate-spin text-ink-400" aria-hidden />}
            {extraAction}
          </div>
        </div>
      )}

      {open && !value && query.trim().length >= 2 && (
        <ul
          id={listId}
          role="listbox"
          className="glass-strong absolute inset-x-0 top-full z-[600] mt-2 max-h-72 animate-fade-in overflow-y-auto rounded-xl p-1.5 shadow-xl"
        >
          {results.length === 0 && !loading && (
            <li className="px-3 py-6 text-center">
              <p className="text-sm text-ink-600 dark:text-ink-300">
                No places match &ldquo;{query}&rdquo;
              </p>
              <p className="mt-1 text-xs text-ink-400">
                Try a landmark, district or road name — or tap the map to drop a point.
              </p>
            </li>
          )}

          {results.map((place, index) => {
            const PlaceIcon = CATEGORY_ICON[place.category] ?? MapPin;
            const isRemote = place.source === 'openstreetmap-nominatim';
            return (
              <li key={place.id} role="option" aria-selected={index === activeIndex}>
                <button
                  id={`${listId}-${index}`}
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(place)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition',
                    index === activeIndex
                      ? 'bg-brand-500/12'
                      : 'hover:bg-ink-100/70 dark:hover:bg-white/6',
                  )}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink-100 text-ink-500 dark:bg-white/8 dark:text-ink-300">
                    <PlaceIcon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink-900 dark:text-ink-50">
                      {place.name}
                    </span>
                    <span className="block truncate text-[11px] text-ink-500 dark:text-ink-400">
                      {place.district || place.category_label}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                      isRemote
                        ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
                        : 'bg-ink-500/10 text-ink-500 dark:text-ink-400',
                    )}
                  >
                    {isRemote ? 'OSM' : 'Built-in'}
                  </span>
                </button>
              </li>
            );
          })}

          {sources?.openstreetmap_nominatim?.available === false && (
            <li className="border-t border-ink-200/60 px-3 py-2 dark:border-white/8">
              <p className="text-[10px] leading-relaxed text-ink-400">
                OpenStreetMap search is unreachable, so only built-in landmarks are shown.
              </p>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
