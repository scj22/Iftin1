/**
 * API client for the Smart Road Express backend.
 *
 * The browser talks only to Express; Express fans out to MongoDB and the
 * FastAPI service. Access tokens live in memory with a localStorage mirror so a
 * refresh keeps the session, and a 401 triggers a single silent refresh attempt
 * before the user is asked to sign in again.
 */

const BASE = '/api';
const TOKEN_KEY = 'smartroad.accessToken';

let accessToken = readStoredToken();
let refreshPromise = null;
const listeners = new Set();

function readStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token) {
  accessToken = token ?? null;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* Private mode or blocked storage: the in-memory token still works. */
  }
  listeners.forEach((listener) => listener(accessToken));
}

/** Notifies subscribers when the session is dropped, so the UI can react. */
export function onTokenChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export class ApiError extends Error {
  constructor(message, { status, details, isNetwork = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.isNetwork = isNetwork;
  }
}

async function parseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function refreshSession() {
  // Collapse concurrent 401s into a single refresh request.
  refreshPromise ??= (async () => {
    try {
      const response = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) return null;
      const data = await parseBody(response);
      if (data?.accessToken) {
        setAccessToken(data.accessToken);
        return data.accessToken;
      }
      return null;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

async function request(path, { method = 'GET', body, signal, retryOn401 = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(
      'Cannot reach the Smart Road server. Check that the backend is running.',
      { isNetwork: true },
    );
  }

  if (response.status === 401 && retryOn401 && accessToken) {
    const fresh = await refreshSession();
    if (fresh) return request(path, { method, body, signal, retryOn401: false });
    setAccessToken(null);
  }

  const data = await parseBody(response);

  if (!response.ok) {
    throw new ApiError(data?.error?.message ?? `Request failed (${response.status}).`, {
      status: response.status,
      details: data?.error?.details,
    });
  }

  return data;
}

const get = (path, options) => request(path, { ...options, method: 'GET' });
const post = (path, body, options) => request(path, { ...options, method: 'POST', body });
const patch = (path, body, options) => request(path, { ...options, method: 'PATCH', body });
const del = (path, options) => request(path, { ...options, method: 'DELETE' });

export const api = {
  health: () => get('/health'),

  auth: {
    register: (payload) => post('/auth/register', payload),
    login: (payload) => post('/auth/login', payload),
    logout: () => post('/auth/logout'),
    refresh: () => post('/auth/refresh'),
    me: () => get('/auth/me'),
    updateProfile: (payload) => patch('/auth/me', payload),
    changePassword: (payload) => post('/auth/change-password', payload),
    forgotPassword: (payload) => post('/auth/forgot-password', payload),
    resetPassword: (payload) => post('/auth/reset-password', payload),
  },

  navigation: {
    plan: (payload, options) => post('/navigation/plan', payload, options),
    snap: (payload, options) => post('/navigation/snap', payload, options),
    searchPlaces: (query, { limit = 8, remote = true, signal } = {}) =>
      get(
        `/navigation/places/search?q=${encodeURIComponent(query)}&limit=${limit}&remote=${remote}`,
        { signal },
      ),
    places: (options) => get('/navigation/places', options),
  },

  traffic: {
    snapshot: (payload, options) => post('/traffic/snapshot', payload, options),
    segments: (payload, options) => post('/traffic/segments', payload, options),
    modelCard: (options) => get('/traffic/model-card', options),
    congestionProfile: (options) => get('/traffic/congestion-profile', options),
    networkStats: (options) => get('/traffic/network-stats', options),
  },

  history: {
    list: ({ limit = 20, skip = 0 } = {}, options) =>
      get(`/history?limit=${limit}&skip=${skip}`, options),
    stats: (options) => get('/history/stats', options),
    save: (payload) => post('/history', payload),
    remove: (id) => del(`/history/${id}`),
    clear: () => del('/history'),
  },
};
