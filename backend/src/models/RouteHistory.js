import mongoose from 'mongoose';

const pointSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 160 },
    lon: { type: Number, required: true, min: -180, max: 180 },
    lat: { type: Number, required: true, min: -90, max: 90 },
  },
  { _id: false },
);

/**
 * A saved navigation request and the outcome the AI service returned for it.
 * Only the selected route's summary is stored, not every alternative's geometry,
 * to keep documents small; re-running the search reproduces the full result.
 */
const routeHistorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    origin: { type: pointSchema, required: true },
    destination: { type: pointSchema, required: true },

    selectedRouteId: { type: String, required: true },
    selectedRouteName: { type: String, required: true },
    wasRecommended: { type: Boolean, default: true },

    distanceKm: { type: Number, required: true, min: 0 },
    durationMinutes: { type: Number, required: true, min: 0 },
    meanSpeedKmh: { type: Number, min: 0 },
    trafficLevel: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], required: true },
    speedRetention: { type: Number, min: 0, max: 1 },
    roadQualityScore: { type: Number, min: 0, max: 1 },
    routeScore: { type: Number, min: 0, max: 100 },
    alternativeCount: { type: Number, default: 0, min: 0 },

    // The prediction context this result was computed under, so an old entry is
    // never mistaken for a current one.
    context: {
      hour: { type: Number, min: 0, max: 23 },
      dayOfWeek: { type: Number, min: 0, max: 6 },
      dayLabel: String,
      weatherCondition: String,
      precipitationMm: Number,
      weatherSource: String,
    },

    explanationHeadline: { type: String, maxlength: 1000 },
    geometry: {
      type: { type: String, enum: ['LineString'], default: 'LineString' },
      coordinates: { type: [[Number]], default: [] },
    },

    trafficDataType: { type: String, default: 'prototype' },
  },
  { timestamps: true },
);

routeHistorySchema.index({ userId: 1, createdAt: -1 });

routeHistorySchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    origin: this.origin,
    destination: this.destination,
    selectedRouteId: this.selectedRouteId,
    selectedRouteName: this.selectedRouteName,
    wasRecommended: this.wasRecommended,
    distanceKm: this.distanceKm,
    durationMinutes: this.durationMinutes,
    meanSpeedKmh: this.meanSpeedKmh,
    trafficLevel: this.trafficLevel,
    speedRetention: this.speedRetention,
    roadQualityScore: this.roadQualityScore,
    routeScore: this.routeScore,
    alternativeCount: this.alternativeCount,
    context: this.context,
    explanationHeadline: this.explanationHeadline,
    geometry: this.geometry,
    trafficDataType: this.trafficDataType,
    createdAt: this.createdAt,
  };
};

export const RouteHistory = mongoose.model('RouteHistory', routeHistorySchema);
