import amqp from 'amqplib';
import type { Server } from 'socket.io';
import type { BusEvent } from '@uniroute/shared';
import { RABBITMQ_CONFIG } from '@uniroute/shared';

const RECONNECT_DELAY_MS = 5000;

const rabbitmqUrl = process.env.RABBITMQ_URL;

if (!rabbitmqUrl) {
  throw new Error('RABBITMQ_URL environment variable is required');
}

let connection: any = null;
let channel: any = null;
let isReconnecting = false;

const SOCKET_EVENT_BY_TYPE: Record<BusEvent['type'], string> = {
  STATUS_CHANGE: 'bus:status',
  GPS_UPDATE: 'bus:gps',
  AFORO_UPDATE: 'bus:aforo',
  PROXIMITY_UPDATE: 'proximity:update',
};

function handleEvent(io: Server, event: BusEvent): void {
  const socketEvent = SOCKET_EVENT_BY_TYPE[event.type];

  if (event.type === 'PROXIMITY_UPDATE') {
    io.to(`conductor:${event.busId}`).emit(socketEvent, event);
  } else {
    io.to(`route:${event.routeId}`).emit(socketEvent, event);
  }

  // dashboard-admin listens for the same type-specific event names, plus the generic bus:event
  io.to('admin:fleet').emit(socketEvent, event);
  io.to('admin:fleet').emit('bus:event', event);
}

export async function connectRabbitMQConsumer(io: Server): Promise<void> {
  try {
    connection = await amqp.connect(rabbitmqUrl!);
    channel = await connection.createChannel();
    await channel.prefetch(10);

    await channel.assertExchange(RABBITMQ_CONFIG.EXCHANGE_NAME, RABBITMQ_CONFIG.EXCHANGE_TYPE, {
      durable: true,
    });

    await channel.assertQueue(RABBITMQ_CONFIG.QUEUE_WS, { durable: true });
    await channel.bindQueue(
      RABBITMQ_CONFIG.QUEUE_WS,
      RABBITMQ_CONFIG.EXCHANGE_NAME,
      RABBITMQ_CONFIG.BINDING_KEY_ALL,
    );

    console.log('[websocket-server] Connected to RabbitMQ, consuming from', RABBITMQ_CONFIG.QUEUE_WS);

    channel.consume(RABBITMQ_CONFIG.QUEUE_WS, (msg: any) => {
      if (!msg) return;

      try {
        const event: BusEvent = JSON.parse(msg.content.toString());
        handleEvent(io, event);
        channel.ack(msg);
      } catch (err) {
        console.error('[websocket-server] Error processing message, requeueing:', err);
        channel.nack(msg, false, true);
      }
    });

    connection.on('error', (err: any) => {
      console.error('[websocket-server] RabbitMQ connection error:', err);
    });

    connection.on('close', () => {
      console.warn('[websocket-server] RabbitMQ connection closed');
      connection = null;
      channel = null;
      if (!isReconnecting) {
        scheduleReconnect(io);
      }
    });
  } catch (err) {
    console.error('[websocket-server] Failed to connect to RabbitMQ:', err);
    if (!isReconnecting) {
      scheduleReconnect(io);
    }
  }
}

function scheduleReconnect(io: Server): void {
  isReconnecting = true;
  console.warn(`[websocket-server] Retrying RabbitMQ connection in ${RECONNECT_DELAY_MS / 1000}s...`);
  setTimeout(async () => {
    isReconnecting = false;
    await connectRabbitMQConsumer(io);
  }, RECONNECT_DELAY_MS);
}
