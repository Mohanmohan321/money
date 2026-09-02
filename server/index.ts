import 'dotenv/config';

import { shouldStartHttpServer } from '../shared/deployment';
import app, { config } from '../index';

if (shouldStartHttpServer(process.env)) {
  const server = app.listen(config.port, '0.0.0.0', () => {
    console.info(`Money manager listening on port ${config.port}`);
  });

  const shutdown = () => {
    server.close((error) => {
      if (error) {
        console.error('Failed to stop HTTP server', { error: error.message });
        process.exitCode = 1;
      }
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
