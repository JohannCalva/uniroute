import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'rutas-service' });
});

app.listen(PORT, () => {
  console.log(`rutas-service running on port ${PORT}`);
});
