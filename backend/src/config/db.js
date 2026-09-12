import mongoose from 'mongoose';
import { env } from './env.js';

/**
 * Database availability is tracked rather than assumed. If MongoDB is not
 * reachable the API still serves navigation and traffic — which need no
 * persistence — and the endpoints that genuinely require a database return a
 * clear 503 instead of a confusing crash.
 */
const state = {
  connected: false,
  lastError: null,
};

export function isDbConnected() {
  return state.connected && mongoose.connection.readyState === 1;
}

export function dbStatus() {
  return {
    connected: isDbConnected(),
    readyState: mongoose.connection.readyState,
    lastError: state.lastError,
    features: {
      authentication: isDbConnected(),
      routeHistory: isDbConnected(),
      navigation: true,
      traffic: true,
    },
  };
}

export async function connectDatabase() {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('disconnected', () => {
    state.connected = false;
    console.warn('[db] MongoDB disconnected');
  });
  mongoose.connection.on('reconnected', () => {
    state.connected = true;
    state.lastError = null;
    console.log('[db] MongoDB reconnected');
  });

  try {
    await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
    });
    state.connected = true;
    state.lastError = null;
    console.log(`[db] Connected to MongoDB at ${redact(env.mongoUri)}`);
  } catch (error) {
    state.connected = false;
    state.lastError = error.message;
    if (env.mongoRequired) throw error;
    console.warn(
      `[db] MongoDB unavailable (${error.message}). ` +
        'Accounts and route history are disabled; navigation and traffic remain available.',
    );
  }
}

function redact(uri) {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
}
