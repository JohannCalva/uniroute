import express from 'express';
import cors from 'cors';

import {
  checkDatabaseConnection,
  closeDatabaseConnection,
} from './db';

const app = express();
const PORT = Number(process.env.PORT || 3001);

app.disable('x-powered-by');

app.use(cors());
app.use(express.json());

app.get('/health', async (_req, res) => {
  try {
    const databaseOk = await checkDatabaseConnection();

    res.status(200).json({
      status: 'ok',
      service: 'usuarios-service',
      database: databaseOk ? 'ok' : 'error',
    });
  } catch (error) {
    console.error('[usuarios-service] health check failed:', error);

    res.status(503).json({
      status: 'error',
      service: 'usuarios-service',
      database: 'error',
    });
  }
});

app.use((_req, res) => {
  res.status(404).json({
    error: 'Route not found',
    code: 'ROUTE_NOT_FOUND',
  });
});

const server = app.listen(PORT, () => {
  console.log(`usuarios-service running on port ${PORT}`);
});

async function shutdown(): Promise<void> {
  console.log('[usuarios-service] shutting down...');

  server.close(async () => {
    await closeDatabaseConnection();
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);