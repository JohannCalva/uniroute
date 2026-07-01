import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { RABBITMQ_CONFIG } from '@uniroute/shared';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});
const PORT = process.env.PORT || 3003;

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'websocket-server' });
});

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('subscribe:route', (routeId: string) => {
    socket.join(`route:${routeId}`);
  });

  socket.on('unsubscribe:route', (routeId: string) => {
    socket.leave(`route:${routeId}`);
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

console.log(`Using exchange: ${RABBITMQ_CONFIG.EXCHANGE_NAME}`);

httpServer.listen(PORT, () => {
  console.log(`websocket-server running on port ${PORT}`);
});
