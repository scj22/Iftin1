import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validate } from '../middleware/index.js';
import { getAi, postAi } from '../services/aiClient.js';

export const trafficRouter = Router();

const contextSchema = {
  hour: z.number().int().min(0).max(23).optional(),
  day_of_week: z.number().int().min(0).max(6).optional(),
  weather: z
    .object({
      precipitation_mm: z.number().min(0).max(200).optional(),
      temperature_c: z.number().min(-20).max(60).optional(),
      cloud_cover_pct: z.number().min(0).max(100).optional(),
      wind_speed_kmh: z.number().min(0).max(300).optional(),
    })
    .optional(),
  use_live_weather: z.boolean().default(true),
};

trafficRouter.post(
  '/snapshot',
  validate(z.object(contextSchema)),
  asyncHandler(async (req, res) => {
    res.json(await postAi('/api/v1/traffic/snapshot', req.body));
  }),
);

trafficRouter.post(
  '/segments',
  validate(
    z.object({
      ...contextSchema,
      min_lon: z.number().min(-180).max(180),
      min_lat: z.number().min(-90).max(90),
      max_lon: z.number().min(-180).max(180),
      max_lat: z.number().min(-90).max(90),
      limit: z.number().int().min(50).max(4000).default(1200),
      min_road_class: z.number().min(0).max(1).default(0.5),
    }),
  ),
  asyncHandler(async (req, res) => {
    res.json(await postAi('/api/v1/traffic/segments', req.body));
  }),
);

trafficRouter.get(
  '/model-card',
  asyncHandler(async (_req, res) => {
    res.json(await getAi('/api/v1/model/card', { ttlMs: 5 * 60_000 }));
  }),
);

trafficRouter.get(
  '/congestion-profile',
  asyncHandler(async (_req, res) => {
    res.json(await getAi('/api/v1/model/congestion-profile', { ttlMs: 5 * 60_000 }));
  }),
);

trafficRouter.get(
  '/network-stats',
  asyncHandler(async (_req, res) => {
    res.json(await getAi('/api/v1/network/stats', { ttlMs: 5 * 60_000 }));
  }),
);
