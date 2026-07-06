import express from 'express';
import cors from 'cors';
import { checkDatabaseConnection } from './db';
import { checkRedisConnection } from './redis';
import { connectRabbitMQ, checkRabbitMQConnection } from './rabbitmq';
import despachosRoutes from './routes/despachos.routes';

const app = express();
const PORT = process.env.PORT || 3004;

app.use(cors());
app.use(express.json());

app.use('/api/v1', despachosRoutes);

app.get('/health', async (_req, res) => {
  const dbOk = await checkDatabaseConnection();
  const redisOk = await checkRedisConnection();
  const rabbitmqOk = await checkRabbitMQConnection();

  if (!dbOk || !redisOk || !rabbitmqOk) {
    return res.status(503).json({
      status: 'error',
      service: 'despachos-service',
      dependencies: {
        db: dbOk,
        redis: redisOk,
        rabbitmq: rabbitmqOk,
      },
    });
  }

  res.json({
    status: 'ok',
    service: 'despachos-service',
    dependencies: {
      db: dbOk,
      redis: redisOk,
      rabbitmq: rabbitmqOk,
    },
  });
});

async function startServer() {
  console.log('[despachos-service] Initializing connections...');
  
  try {
    await connectRabbitMQ();
  } catch (err) {
    console.error('[despachos-service] Failed to connect to RabbitMQ on startup. Will continue starting server for health checks.');
  }
  
  app.listen(PORT, () => {
    console.log(`[despachos-service] running on port ${PORT}`);
  });
}

startServer();
