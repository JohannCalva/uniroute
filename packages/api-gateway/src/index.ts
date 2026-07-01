import express from 'express';
import cors from 'cors';
import { SERVICE_REGISTRY, API_ROUTES } from '@uniroute/shared';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'api-gateway' });
});

app.use('/api/v1', (req, res) => {
  const matchedPrefix = Object.keys(API_ROUTES).find((prefix) =>
    req.path.startsWith(prefix.replace('/api/v1', '')),
  );
  const serviceName = matchedPrefix ? API_ROUTES[matchedPrefix] : null;
  const serviceUrl = serviceName
    ? SERVICE_REGISTRY[serviceName as keyof typeof SERVICE_REGISTRY]
    : null;

  if (!serviceUrl) {
    res.status(404).json({ error: 'Route not found', code: 'ROUTE_NOT_FOUND' });
    return;
  }

  res.status(200).json({ proxying: serviceUrl, path: req.path });
});

app.listen(PORT, () => {
  console.log(`api-gateway running on port ${PORT}`);
});
