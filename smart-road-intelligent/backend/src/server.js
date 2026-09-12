import { createApp } from './app.js';
import { connectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { pingAi } from './services/aiClient.js';

async function start() {
  await connectDatabase();

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`[server] Smart Road API listening on http://127.0.0.1:${env.port}`);
    console.log(`[server] AI service expected at ${env.aiServiceUrl}`);
  });

  // Report AI reachability at boot so a missing service is obvious immediately
  // rather than surfacing as a failed request later.
  const ai = await pingAi();
  console.log(
    ai.ok
      ? `[server] AI service reachable (${ai.health?.network_segments} segments loaded)`
      : `[server] AI service NOT reachable: ${ai.error}`,
  );

  const shutdown = (signal) => {
    console.log(`[server] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((error) => {
  console.error('[server] Failed to start:', error);
  process.exit(1);
});
