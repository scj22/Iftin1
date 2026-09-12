import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { MOGADISHU } from '../lib/constants.js';

/** Debounces a rapidly changing value (search input, map viewport). */
export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Tracks whether the component is still mounted, for async guards. */
export function useIsMounted() {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}

const inCoverage = ({ lat, lon }) => {
  const [[minLat, minLon], [maxLat, maxLon]] = MOGADISHU.maxBounds;
  return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
};

/**
 * Browser geolocation with the outcomes the UI actually needs to distinguish:
 * unsupported, denied, unavailable, and "found but outside Mogadishu" — the last
 * matters because the routable network only covers Banaadir.
 */
export function useGeolocation() {
  const [position, setPosition] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  const locate = useCallback(
    () =>
      new Promise((resolve) => {
        if (!('geolocation' in navigator)) {
          setStatus('unsupported');
          setError('This browser does not support location access.');
          resolve(null);
          return;
        }

        setStatus('locating');
        setError(null);

        navigator.geolocation.getCurrentPosition(
          ({ coords }) => {
            const found = {
              lat: coords.latitude,
              lon: coords.longitude,
              accuracy: coords.accuracy,
            };
            if (!inCoverage(found)) {
              setStatus('out-of-coverage');
              setError(
                'You appear to be outside Mogadishu. Smart Road currently covers Banaadir only, so pick a starting point on the map.',
              );
              setPosition(found);
              resolve(null);
              return;
            }
            setPosition(found);
            setStatus('found');
            resolve(found);
          },
          (geoError) => {
            const messages = {
              1: 'Location permission was denied. You can still pick a starting point on the map.',
              2: 'Your location is not available right now. Try again or pick a point on the map.',
              3: 'Finding your location took too long. Try again or pick a point on the map.',
            };
            setStatus(geoError.code === 1 ? 'denied' : 'unavailable');
            setError(messages[geoError.code] ?? 'Could not determine your location.');
            resolve(null);
          },
          { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
        );
      }),
    [],
  );

  return { position, status, error, locate, isLocating: status === 'locating' };
}

/** Debounced place search against the backend, with in-flight cancellation. */
export function usePlaceSearch(query, { enabled = true, limit = 8 } = {}) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sources, setSources] = useState(null);
  const debounced = useDebounced(query, 280);

  useEffect(() => {
    if (!enabled || debounced.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);

    api.navigation
      .searchPlaces(debounced.trim(), { limit, signal: controller.signal })
      .then((data) => {
        setResults(data.results ?? []);
        setSources(data.sources ?? null);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setResults([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [debounced, enabled, limit]);

  return { results, loading, sources };
}

/** Loads the full built-in gazetteer once, for pickers and quick suggestions. */
export function usePlaces() {
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.navigation
      .places()
      .then((data) => !cancelled && setPlaces(data.places ?? []))
      .catch(() => !cancelled && setPlaces([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return { places, loading };
}

/**
 * Generic async data hook with explicit loading / error / retry states, so every
 * page can render a real skeleton, a real error and a real empty state.
 */
export function useAsync(fetcher, deps = [], { immediate = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!immediate) return undefined;
    const controller = new AbortController();
    let cancelled = false;

    setLoading(true);
    setError(null);

    fetcher({ signal: controller.signal })
      .then((result) => !cancelled && setData(result))
      .catch((requestError) => {
        if (requestError.name === 'AbortError' || cancelled) return;
        setError(requestError);
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller-controlled deps
  }, [...deps, nonce, immediate]);

  const retry = useCallback(() => setNonce((value) => value + 1), []);
  return { data, loading, error, retry, setData };
}
