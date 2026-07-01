import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'usuarios-service' });
});

app.listen(PORT, () => {
  console.log(`usuarios-service running on port ${PORT}`);
});
