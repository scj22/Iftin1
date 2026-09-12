/** Map view centred on Mogadishu, matching the prepared network's extent. */
export const MOGADISHU = {
  center: [2.0371, 45.3438],
  zoom: 13,
  minZoom: 11,
  maxZoom: 18,
  // Slightly padded around the routable network so panning cannot leave coverage.
  maxBounds: [
    [1.94, 45.19],
    [2.14, 45.47],
  ],
};

export const TILE_LAYER = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};

/**
 * The demo scenario. Coordinates are real gazetteer anchors that the AI service
 * snaps to the routable network; the route, timings and explanation are computed
 * live by the same code path a normal search uses. Nothing here is pre-recorded.
 */
export const DEMO_SCENARIO = {
  origin: { name: 'Aden Adde International Airport', lon: 45.3047, lat: 2.0144 },
  destination: { name: 'Bakara Market', lon: 45.3269, lat: 2.0469 },
  hour: 17,
  dayOfWeek: 1,
  caption:
    'Evening peak, airport to the main market - the busiest corridor in Mogadishu at the busiest hour.',
};

export const ROUTE_COLORS = {
  recommended: '#06a6ec',
  alternatives: ['#8b5cf6', '#f0a01a', '#ec4899'],
  muted: '#94a3b8',
};

/**
 * Every surface that shows predicted traffic carries this label. Prototype
 * predictions are never presented as live observations.
 */
export const PROTOTYPE_NOTICE = {
  short: 'AI Prototype Prediction',
  long: 'Predicted from a trained model over a prepared OpenStreetMap road network, combined with a published rule-based time-of-day profile. Not live traffic data.',
};

export const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: 'House', end: true },
  { to: '/app', label: 'Dashboard', icon: 'LayoutDashboard', end: true },
  { to: '/app/navigate', label: 'Smart Navigation', icon: 'Navigation' },
  { to: '/app/traffic', label: 'Traffic', icon: 'Waypoints' },
  { to: '/app/history', label: 'Route History', icon: 'History', requiresAuth: true },
];

export const ACCOUNT_ITEMS = [
  { to: '/app/profile', label: 'Profile', icon: 'User', requiresAuth: true },
  { to: '/app/settings', label: 'Settings', icon: 'Settings' },
];
