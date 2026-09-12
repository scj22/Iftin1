import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { RouteHistory } from '../models/RouteHistory.js';
import {
  ApiError,
  asyncHandler,
  requireAuth,
  requireDatabase,
  validate,
} from '../middleware/index.js';

export const historyRouter = Router();

historyRouter.use(requireDatabase, requireAuth);

const pointSchema = z.object({
  name: z.string().trim().max(160).optional(),
  lon: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
});

const saveSchema = z.object({
  origin: pointSchema,
  destination: pointSchema,
  selectedRouteId: z.string().min(1).max(64),
  selectedRouteName: z.string().min(1).max(64),
  wasRecommended: z.boolean().default(true),
  distanceKm: z.number().min(0).max(10_000),
  durationMinutes: z.number().min(0).max(100_000),
  meanSpeedKmh: z.number().min(0).max(400).optional(),
  trafficLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  speedRetention: z.number().min(0).max(1).optional(),
  roadQualityScore: z.number().min(0).max(1).optional(),
  routeScore: z.number().min(0).max(100).optional(),
  alternativeCount: z.number().int().min(0).max(10).default(0),
  context: z
    .object({
      hour: z.number().int().min(0).max(23).optional(),
      dayOfWeek: z.number().int().min(0).max(6).optional(),
      dayLabel: z.string().max(20).optional(),
      weatherCondition: z.string().max(60).optional(),
      precipitationMm: z.number().min(0).max(500).optional(),
      weatherSource: z.string().max(80).optional(),
    })
    .optional(),
  explanationHeadline: z.string().max(1000).optional(),
  // Geometry is capped so a single document cannot grow without bound.
  geometry: z
    .object({
      type: z.literal('LineString').default('LineString'),
      coordinates: z.array(z.tuple([z.number(), z.number()])).max(3000),
    })
    .optional(),
});

historyRouter.post(
  '/',
  validate(saveSchema),
  asyncHandler(async (req, res) => {
    const entry = await RouteHistory.create({ ...req.body, userId: req.auth.sub });
    res.status(201).json({ entry: entry.toPublic() });
  }),
);

historyRouter.get(
  '/',
  validate(
    z.object({
      limit: z.coerce.number().int().min(1).max(100).default(20),
      skip: z.coerce.number().int().min(0).default(0),
    }),
    'query',
  ),
  asyncHandler(async (req, res) => {
    const { limit, skip } = req.query;
    const filter = { userId: req.auth.sub };

    const [entries, total] = await Promise.all([
      RouteHistory.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      RouteHistory.countDocuments(filter),
    ]);

    res.json({
      entries: entries.map((entry) => entry.toPublic()),
      total,
      limit,
      skip,
      hasMore: skip + entries.length < total,
    });
  }),
);

/** Aggregate stats over the signed-in user's own history. */
historyRouter.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const userId = req.auth.sub;
    const [summary] = await RouteHistory.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          trips: { $sum: 1 },
          totalDistanceKm: { $sum: '$distanceKm' },
          totalDurationMinutes: { $sum: '$durationMinutes' },
          averageSpeedKmh: { $avg: '$meanSpeedKmh' },
          recommendedTaken: { $sum: { $cond: ['$wasRecommended', 1, 0] } },
        },
      },
    ]);

    const byLevel = await RouteHistory.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: '$trafficLevel', count: { $sum: 1 } } },
    ]);

    res.json({
      trips: summary?.trips ?? 0,
      totalDistanceKm: Number((summary?.totalDistanceKm ?? 0).toFixed(1)),
      totalDurationMinutes: Number((summary?.totalDurationMinutes ?? 0).toFixed(0)),
      averageSpeedKmh: summary?.averageSpeedKmh ? Number(summary.averageSpeedKmh.toFixed(1)) : null,
      recommendedTaken: summary?.recommendedTaken ?? 0,
      trafficLevels: Object.fromEntries(byLevel.map((row) => [row._id, row.count])),
    });
  }),
);

historyRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const deleted = await RouteHistory.findOneAndDelete({
      _id: req.params.id,
      userId: req.auth.sub,
    });
    if (!deleted) throw new ApiError(404, 'That saved route no longer exists.');
    res.json({ message: 'Route removed from your history.', id: req.params.id });
  }),
);

historyRouter.delete(
  '/',
  asyncHandler(async (req, res) => {
    const { deletedCount } = await RouteHistory.deleteMany({ userId: req.auth.sub });
    res.json({ message: 'Your route history has been cleared.', deletedCount });
  }),
);
