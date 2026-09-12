/**
 * Seeds a demo account with real route history.
 *
 * The history is not fabricated: each entry is planned by calling the running
 * AI service, so every distance, duration and explanation stored is a genuine
 * result the app would produce for that trip. Requires the AI service to be up.
 *
 * Usage:  npm run seed
 */
import mongoose from 'mongoose';
import { connectDatabase, isDbConnected } from '../config/db.js';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { RouteHistory } from '../models/RouteHistory.js';
import { pingAi, postAi } from '../services/aiClient.js';

const DEMO_USER = {
  name: 'Amina Yusuf',
  email: 'demo@smartroad.so',
  password: 'SmartRoad2026',
};

const TRIPS = [
  {
    origin: { name: 'Aden Adde International Airport', lon: 45.3047, lat: 2.0144 },
    destination: { name: 'Bakara Market', lon: 45.3269, lat: 2.0469 },
    hour: 17,
    day_of_week: 1,
  },
  {
    origin: { name: 'Port of Mogadishu', lon: 45.3444, lat: 2.0208 },
    destination: { name: 'KM4 Junction', lon: 45.3197, lat: 2.0397 },
    hour: 8,
    day_of_week: 2,
  },
  {
    origin: { name: 'Banadir Hospital', lon: 45.3242, lat: 2.0344 },
    destination: { name: 'Mogadishu University', lon: 45.33, lat: 2.055 },
    hour: 12,
    day_of_week: 4,
  },
  {
    origin: { name: 'Lido Beach', lon: 45.3389, lat: 2.05 },
    destination: { name: 'Wadajir District', lon: 45.295, lat: 2.01 },
    hour: 7,
    day_of_week: 6,
  },
  {
    origin: { name: 'Hamarweyne Old Town', lon: 45.34, lat: 2.025 },
    destination: { name: 'Daynile District', lon: 45.27, lat: 2.07 },
    hour: 18,
    day_of_week: 3,
  },
];

async function main() {
  await connectDatabase();
  if (!isDbConnected()) {
    throw new Error(`MongoDB is not reachable at ${env.mongoUri}. Start it and try again.`);
  }

  const ai = await pingAi();
  if (!ai.ok) {
    throw new Error(
      `The AI service at ${env.aiServiceUrl} is not reachable, so real routes cannot be planned. ` +
        'Start it first: uvicorn app.main:app --port 8000',
    );
  }

  let user = await User.findOne({ email: DEMO_USER.email });
  if (user) {
    console.log(`[seed] Reusing existing demo account ${DEMO_USER.email}`);
  } else {
    user = new User({ name: DEMO_USER.name, email: DEMO_USER.email });
    await user.setPassword(DEMO_USER.password);
    await user.save();
    console.log(`[seed] Created demo account ${DEMO_USER.email}`);
  }

  const removed = await RouteHistory.deleteMany({ userId: user._id });
  if (removed.deletedCount) {
    console.log(`[seed] Cleared ${removed.deletedCount} existing history entries`);
  }

  let created = 0;
  for (const [index, trip] of TRIPS.entries()) {
    const plan = await postAi('/api/v1/routes/plan', {
      origin: { lon: trip.origin.lon, lat: trip.origin.lat },
      destination: { lon: trip.destination.lon, lat: trip.destination.lat },
      hour: trip.hour,
      day_of_week: trip.day_of_week,
      alternatives: 2,
      use_live_weather: false,
    });

    const route = plan.routes[0];
    await RouteHistory.create({
      userId: user._id,
      origin: trip.origin,
      destination: trip.destination,
      selectedRouteId: route.id,
      selectedRouteName: route.name,
      wasRecommended: true,
      distanceKm: route.distance_km,
      durationMinutes: route.duration_minutes,
      meanSpeedKmh: route.mean_speed_kmh,
      trafficLevel: route.traffic_level,
      speedRetention: route.speed_retention,
      roadQualityScore: route.road_quality_score,
      routeScore: route.score,
      alternativeCount: Math.max(0, plan.routes.length - 1),
      context: {
        hour: plan.context.hour,
        dayOfWeek: plan.context.day_of_week,
        dayLabel: plan.context.day_label,
        weatherCondition: plan.context.weather.condition,
        precipitationMm: plan.context.weather.precipitation_mm,
        weatherSource: plan.context.weather.source,
      },
      explanationHeadline: plan.explanation.headline,
      geometry: route.geometry,
      // Stagger timestamps so the history reads like real usage over a week.
      createdAt: new Date(Date.now() - (index + 1) * 19 * 60 * 60 * 1000),
    });

    created += 1;
    console.log(
      `[seed] ${trip.origin.name} -> ${trip.destination.name}: ` +
        `${route.distance_km} km, ${route.duration_minutes} min, ${route.traffic_level}`,
    );
  }

  console.log(`\n[seed] Done. ${created} routes saved.`);
  console.log(`[seed] Sign in with ${DEMO_USER.email} / ${DEMO_USER.password}`);
  console.log('[seed] This account is for local demonstration only — do not deploy it.');

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(`[seed] Failed: ${error.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
