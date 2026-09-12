import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import { env } from './config/env.js';
import { dbStatus } from './config/db.js';
import { aiStatus, pingAi } from './services/aiClient.js';
import { apiLimiter, errorHandler, notFound } from './middleware/index.js';
import { authRouter } from './routes/auth.js';
import { navigationRouter } from './routes/navigation.js';
import { trafficRouter } from './routes/traffic.js';
import { historyRouter } from './routes/history.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );
  app.use(express.json({ limit: '512kb' }));
  app.use(cookieParser());
  if (!env.isProduction) app.use(morgan('dev'));

  /**
   * Reports what is actually up. Nothing here claims a dependency is connected
   * without having checked it, so the UI can show honest degraded states.
   */
  app.get('/api/health', async (_req, res) => {
    const ai = await pingAi();
    const database = dbStatus();
    const degraded = [];
    if (!ai.ok) degraded.push('ai-service');
    if (!database.connected) degraded.push('database');

    res.status(200).json({
      status: degraded.length === 0 ? 'ok' : 'degraded',
      degraded,
      service: 'smart-road-backend',
      environment: env.nodeEnv,
      database,
      aiService: { ...aiStatus(), reachable: ai.ok, health: ai.health ?? null },
      capabilities: {
        navigation: ai.ok,
        traffic: ai.ok,
        accounts: database.connected,
        routeHistory: database.connected,
      },
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api', apiLimiter);
  app.use('/api/auth', authRouter);
  app.use('/api/navigation', navigationRouter);
  app.use('/api/traffic', trafficRouter);
  app.use('/api/history', historyRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
