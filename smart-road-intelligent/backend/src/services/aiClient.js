import { request } from 'undici';
import { env } from '../config/env.js';
import { ApiError } from '../middleware/index.js';

/**
 * Thin client for the FastAPI inference service.
 *
 * Reachability is tracked so `/api/health` can report the truth rather than
 * claiming the AI is connected when it is not. Read-only GETs are cached
 * briefly because the model card, network statistics and congestion profile do
 * not change between requests.
 */
const state = {
  reachable: null,
  lastCheckedAt: null,
  lastError: null,
};

const cache = new Map();

export function aiStatus() {
  return {
    url: env.aiServiceUrl,
    reachable: state.reachable,
    lastCheckedAt: state.lastCheckedAt,
    lastError: state.lastError,
  };
}

function markReachable(reachable, errorMessage = null) {
  state.reachable = reachable;
  state.lastCheckedAt = new Date().toISOString();
  state.lastError = errorMessage;
}

async function call(method, path, { body, timeoutMs = env.aiTimeoutMs } = {}) {
  const url = `${env.aiServiceUrl}${path}`;
  try {
    const response = await request(url, {
      method,
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.body.text();
    const payload = text ? safeParse(text) : null;

    if (response.statusCode >= 400) {
      markReachable(true, `HTTP ${response.statusCode}`);
      const detail = payload?.detail;
      throw new ApiError(
        response.statusCode === 422 ? 422 : 502,
        typeof detail === 'string' ? detail : 'The AI service rejected that request.',
        typeof detail === 'string' ? undefined : detail,
      );
    }

    markReachable(true);
    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    markReachable(false, error.message);
    throw new ApiError(
      503,
      'The AI service is not reachable right now, so routes and traffic predictions are unavailable. ' +
        'Start it with: uvicorn app.main:app --port 8000',
      { url, cause: error.message },
    );
  }
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function postAi(path, body) {
  return call('POST', path, { body });
}

/** GET with a short TTL cache for endpoints whose answer is effectively static. */
export async function getAi(path, { ttlMs = 60_000 } = {}) {
  const cached = cache.get(path);
  if (cached && Date.now() - cached.at < ttlMs) return cached.value;

  const value = await call('GET', path);
  cache.set(path, { at: Date.now(), value });
  return value;
}

export async function pingAi() {
  try {
    const health = await call('GET', '/health', { timeoutMs: 4000 });
    return { ok: health?.status === 'ok', health };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
