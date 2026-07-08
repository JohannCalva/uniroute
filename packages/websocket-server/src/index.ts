import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { connectRabbitMQConsumer } from './rabbitmq-consumer';

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

function extractRouteId(payload: string | { routeId: string }): string {
  return typeof payload === 'string' ? payload : payload.routeId;
}

function extractBusId(payload: string | { busId: string }): string {
  return typeof payload === 'string' ? payload : payload.busId;
}

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('subscribe:route', (payload) => {
    socket.join(`route:${extractRouteId(payload)}`);
  });

  socket.on('unsubscribe:route', (payload) => {
    socket.leave(`route:${extractRouteId(payload)}`);
  });

  socket.on('subscribe:driver', (payload) => {
    socket.join(`conductor:${extractBusId(payload)}`);
  });

  socket.on('unsubscribe:driver', (payload) => {
    socket.leave(`conductor:${extractBusId(payload)}`);
  });

  socket.on('subscribe:admin', () => {
    socket.join('admin:fleet');
  });

  socket.on('unsubscribe:admin', () => {
    socket.leave('admin:fleet');
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

connectRabbitMQConsumer(io);

httpServer.listen(PORT, () => {
  console.log(`websocket-server running on port ${PORT}`);
});
