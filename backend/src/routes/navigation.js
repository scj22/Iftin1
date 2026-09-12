import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validate } from '../middleware/index.js';
import { getAi, postAi } from '../services/aiClient.js';

export const navigationRouter = Router();

const coordinate = z.object({
  lon: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
});

const weatherOverride = z
  .object({
    precipitation_mm: z.number().min(0).max(200).optional(),
    temperature_c: z.number().min(-20).max(60).optional(),
    cloud_cover_pct: z.number().min(0).max(100).optional(),
    wind_speed_kmh: z.number().min(0).max(300).optional(),
  })
  .optional();

const planSchema = z.object({
  origin: coordinate,
  destination: coordinate,
  hour: z.number().int().min(0).max(23).optional(),
  day_of_week: z.number().int().min(0).max(6).optional(),
  alternatives: z.number().int().min(0).max(3).default(2),
  weather: weatherOverride,
  use_live_weather: z.boolean().default(true),
});

navigationRouter.post(
  '/plan',
  validate(planSchema),
  asyncHandler(async (req, res) => {
    res.json(await postAi('/api/v1/routes/plan', req.body));
  }),
);

navigationRouter.post(
  '/snap',
  validate(coordinate),
  asyncHandler(async (req, res) => {
    res.json(await postAi('/api/v1/routes/snap', req.body));
  }),
);

navigationRouter.get(
  '/places/search',
  validate(
    z.object({
      q: z.string().trim().min(1).max(120),
      limit: z.coerce.number().int().min(1).max(20).default(8),
      remote: z
        .enum(['true', 'false'])
        .default('true')
        .transform((value) => value === 'true'),
    }),
    'query',
  ),
  asyncHandler(async (req, res) => {
    const { q, limit, remote } = req.query;
    const search = new URLSearchParams({ q, limit: String(limit), remote: String(remote) });
    res.json(await getAi(`/api/v1/places/search?${search}`, { ttlMs: 30_000 }));
  }),
);

navigationRouter.get(
  '/places',
  asyncHandler(async (_req, res) => {
    res.json(await getAi('/api/v1/places', { ttlMs: 10 * 60_000 }));
  }),
);
