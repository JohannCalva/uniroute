import { Redis } from 'ioredis';

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error('REDIS_URL environment variable is required');
}

export const redisClient = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redisClient.on('error', (err) => {
  console.error('[despachos-service] Unexpected Redis error:', err);
});

export async function checkRedisConnection(): Promise<boolean> {
  try {
    const result = await redisClient.ping();
    return result === 'PONG';
  } catch (err) {
    console.error('[despachos-service] Failed to check Redis connection', err);
    return false;
  }
}

export async function closeRedisConnection(): Promise<void> {
  await redisClient.quit();
}
