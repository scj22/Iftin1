import { config } from 'dotenv';
import crypto from 'node:crypto';

config();

const isProduction = process.env.NODE_ENV === 'production';

/**
 * In production every secret must be supplied explicitly. In development a
 * random secret is generated per boot so the app runs out of the box without
 * ever shipping a hardcoded default — tokens simply stop being valid on restart.
 */
function requireSecret(name) {
  const value = process.env[name];
  if (value && value.length >= 32) return value;

  if (isProduction) {
    throw new Error(
      `${name} must be set to at least 32 characters in production. ` +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
    );
  }
  if (value) {
    console.warn(`[config] ${name} is shorter than 32 characters; using a generated value instead.`);
  }
  return crypto.randomBytes(48).toString('hex');
}

function int(name, fallback) {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  isProduction,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: int('PORT', 4000),

  mongoUri: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/smart_road',
  mongoRequired: process.env.MONGODB_REQUIRED === 'true',

  jwtSecret: requireSecret('JWT_SECRET'),
  refreshSecret: requireSecret('JWT_REFRESH_SECRET'),
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? '2h',
  refreshTokenTtl: process.env.REFRESH_TOKEN_TTL ?? '7d',
  refreshCookieDays: int('REFRESH_COOKIE_DAYS', 7),

  aiServiceUrl: (process.env.AI_SERVICE_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, ''),
  aiTimeoutMs: int('AI_TIMEOUT_MS', 20000),

  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  bcryptRounds: int('BCRYPT_ROUNDS', 12),
};
