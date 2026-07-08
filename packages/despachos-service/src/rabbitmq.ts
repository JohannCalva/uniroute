import amqp from "amqplib";
import type { BusEvent } from "@uniroute/shared";
import { RABBITMQ_CONFIG } from "@uniroute/shared";

const rabbitmqUrl = process.env.RABBITMQ_URL;

if (!rabbitmqUrl) {
  throw new Error("RABBITMQ_URL environment variable is required");
}

let connection: any = null;
let channel: any = null; // using any to avoid createChannel errors
let isReconnecting = false;
const EXCHANGE_NAME = RABBITMQ_CONFIG.EXCHANGE_NAME;

export async function connectRabbitMQ(): Promise<void> {
  try {
    connection = await amqp.connect(rabbitmqUrl!);
    channel = await connection.createChannel();

    // Assert the topic exchange
    await channel!.assertExchange(
      EXCHANGE_NAME,
      RABBITMQ_CONFIG.EXCHANGE_TYPE,
      {
        durable: true,
      },
    );

    console.log(
      "[despachos-service] Connected to RabbitMQ and asserted exchange",
    );

    connection?.on("error", (err: any) => {
      console.error("[despachos-service] RabbitMQ connection error:", err);
    });

    connection?.on("close", () => {
      console.warn("[despachos-service] RabbitMQ connection closed");
      connection = null;
      channel = null;
      scheduleReconnect();
    });
  } catch (err) {
    console.error("[despachos-service] Failed to connect to RabbitMQ:", err);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (isReconnecting) return;
  isReconnecting = true;
  console.warn("[despachos-service] Retrying RabbitMQ connection in 5s...");
  setTimeout(() => {
    console.log("[despachos-service] Attempting to reconnect to RabbitMQ...");
    isReconnecting = false;
    connectRabbitMQ();
  }, 5000);
}

export async function checkRabbitMQConnection(): Promise<boolean> {
  return connection !== null && channel !== null;
}

export async function closeRabbitMQConnection(): Promise<void> {
  if (channel) {
    await channel.close();
  }
  if (connection) {
    await connection.close();
  }
  connection = null;
  channel = null;
}

export async function publishEvent(
  routingKey: string,
  event: BusEvent,
): Promise<boolean> {
  if (!channel) {
    console.error(
      "[despachos-service] Cannot publish event: Channel is not open",
    );
    throw new Error("RabbitMQ channel is not open");
  }

  try {
    const payloadBuffer = Buffer.from(JSON.stringify(event));

    const result = channel.publish(EXCHANGE_NAME, routingKey, payloadBuffer, {
      contentType: "application/json",
      persistent: true,
      messageId: event.eventId,
      timestamp: Math.floor(new Date(event.timestamp).getTime() / 1000),
    });

    if (!result) {
      console.warn(
        `[despachos-service] RabbitMQ channel buffer full for event ${event.eventId}`,
      );
      throw new Error("RabbitMQ channel buffer full");
    }

    return true;
  } catch (error) {
    console.error("[despachos-service] Error publishing event:", error);
    throw error;
  }
}
