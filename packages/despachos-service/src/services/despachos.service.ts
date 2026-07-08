import { v4 as uuidv4 } from "uuid";
import { pool } from "../db";
import { redisClient } from "../redis";
import { publishEvent } from "../rabbitmq";
import { lamportQueue } from "./lamport";
import type {
  BusEvent,
  BusStatus,
  ProximityUpdatePayload,
} from "@uniroute/shared";
import {
  verifyBoardingToken,
  haversineDistance,
  estimateWalkingEta,
  REDIS_KEYS,
  ROUTING_KEYS,
} from "@uniroute/shared";

const QR_HMAC_SECRET = process.env.QR_HMAC_SECRET;
if (!QR_HMAC_SECRET) {
  throw new Error("QR_HMAC_SECRET environment variable is required");
}

export class DespachosService {
  private async getAndIncrementLamport(busId: string): Promise<number> {
    const statusObj = await redisClient.hgetall(REDIS_KEYS.busStatus(busId));
    if (!statusObj || !statusObj.status) {
      return 0; // Or throw, but for proximity it might be called when no trip is active, wait, proximity requires active trips.
    }
    const currentClock = parseInt(statusObj.lamportClock || "0", 10);
    const newClock = currentClock + 1;
    await redisClient.hset(REDIS_KEYS.busStatus(busId), {
      lamportClock: newClock,
      lastUpdate: new Date().toISOString(),
    });
    return newClock;
  }

  async iniciarViaje(busId: string, rutaId: string, driverId: string) {
    // 0. Check if bus already has an active trip
    const activeViaje = await redisClient.get(`bus:${busId}:viaje`);
    if (activeViaje) {
      throw new Error("El bus ya tiene un viaje activo");
    }

    // 0. Check if route exists
    const routeRes = await pool.query("SELECT id FROM rutas WHERE id = $1", [
      rutaId,
    ]);
    if (routeRes.rowCount === 0) {
      throw new Error("Ruta no encontrada");
    }

    // 1. Crear registro en PostgreSQL
    const viajeId = uuidv4();
    const now = new Date();

    // Get capacity from bus (assuming we need to read it from DB)
    const busRes = await pool.query(
      "SELECT capacidad_maxima FROM buses WHERE id = $1",
      [busId],
    );
    if (busRes.rowCount === 0) throw new Error("Bus no encontrado");
    const capacidadMaxima = busRes.rows[0].capacidad_maxima;

    await pool.query(
      `INSERT INTO viajes (id, bus_id, ruta_id, conductor_id, inicio_at, estado)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE')`,
      [viajeId, busId, rutaId, driverId, now],
    );

    // 2. Inicializar Redis
    await redisClient.hset(REDIS_KEYS.busStatus(busId), {
      status: "AT_STOP", // Equivalent to EN_PARADA
      lamportClock: 0,
      lastUpdate: now.toISOString(),
    });
    await redisClient.set(REDIS_KEYS.busAforo(busId), "0");
    await redisClient.set(
      REDIS_KEYS.busCapacidad(busId),
      capacidadMaxima.toString(),
    );
    await redisClient.set(REDIS_KEYS.viajeActivo(viajeId), busId);

    // The trip itself might not have a routeId explicitly tracked in Redis if it's available via Postgres or we can add it
    await redisClient.set(`bus:${busId}:ruta`, rutaId);
    await redisClient.set(`bus:${busId}:viaje`, viajeId);

    return {
      viajeId,
      busId,
      rutaId,
      estado: "ACTIVE",
      inicioAt: now.toISOString(),
      lamportClock: 0,
    };
  }

  async cambiarEstado(
    busId: string,
    newStatus: BusStatus,
    incomingClock: number,
  ) {
    // Wait for our turn in causal order
    await lamportQueue.waitForTurn(busId, incomingClock);

    const statusObj = await redisClient.hgetall(REDIS_KEYS.busStatus(busId));
    if (!statusObj || !statusObj.status) {
      throw new Error("Bus no tiene viaje activo");
    }

    const previousStatus = statusObj.status as BusStatus;
    const currentServerClock = parseInt(statusObj.lamportClock || "0", 10);
    const serverLamportClock = Math.max(currentServerClock, incomingClock) + 1;

    try {
      // Actualizar Redis
      await redisClient.hset(REDIS_KEYS.busStatus(busId), {
        status: newStatus,
        lamportClock: serverLamportClock,
        lastUpdate: new Date().toISOString(),
      });

      const payload = {
        previousStatus,
        newStatus,
        triggeredBy: "DRIVER" as const,
      };

      // Persist event in PG
      await pool.query(
        `INSERT INTO eventos_bus (id, bus_id, tipo, payload, lamport_clock, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          uuidv4(),
          busId,
          "STATUS_CHANGE",
          payload,
          serverLamportClock,
          new Date(),
        ],
      );

      // Publish EVENT first (M1 fix)
      const routeId = (await redisClient.get(`bus:${busId}:ruta`)) || "";
      const tripId = (await redisClient.get(`bus:${busId}:viaje`)) || "";
      const event: BusEvent = {
        eventId: uuidv4(),
        type: "STATUS_CHANGE",
        busId,
        routeId,
        tripId,
        lamportClock: serverLamportClock,
        timestamp: new Date().toISOString(),
        payload,
      };
      await publishEvent(ROUTING_KEYS.statusChange(busId), event);

      // Si status = FULL, hacer override del aforo (T3.9)
      if (newStatus === "FULL") {
        const capacidadStr = await redisClient.get(
          REDIS_KEYS.busCapacidad(busId),
        );
        if (capacidadStr) {
          const capacidad = parseInt(capacidadStr, 10);
          await redisClient.set(
            REDIS_KEYS.busAforo(busId),
            capacidad.toString(),
          );

          const overrideClock = await this.getAndIncrementLamport(busId);
          const aforoEvent: BusEvent = {
            eventId: uuidv4(),
            type: "AFORO_UPDATE",
            busId,
            routeId,
            tripId,
            lamportClock: overrideClock,
            timestamp: new Date().toISOString(),
            payload: {
              aforoActual: capacidad,
              capacidadMaxima: capacidad,
              porcentaje: 100,
              trigger: "DRIVER_OVERRIDE",
            },
          };
          await publishEvent(ROUTING_KEYS.aforoUpdate(busId), aforoEvent);
        }
      }

      if (newStatus === "ARRIVED") {
        // T3.7 fix: perform cleanup
        await this.finalizarViaje(busId, true); // true = skip publishing STATUS_CHANGE again
      }

      return {
        accepted: true,
        serverLamportClock,
        busId,
        status: newStatus,
      };
    } finally {
      lamportQueue.notifyProcessed(busId, incomingClock);
    }
  }

  async actualizarGps(busId: string, latitude: number, longitude: number) {
    const statusObj = await redisClient.hgetall(REDIS_KEYS.busStatus(busId));
    if (!statusObj || Object.keys(statusObj).length === 0) {
      throw new Error("Bus no tiene viaje activo");
    }

    const now = new Date().toISOString();
    await redisClient.hset(REDIS_KEYS.busStatus(busId), {
      lat: latitude,
      lng: longitude,
      lastUpdate: now,
    });

    const event: BusEvent = {
      eventId: uuidv4(),
      type: "GPS_UPDATE",
      busId,
      routeId: (await redisClient.get(`bus:${busId}:ruta`)) || "",
      tripId: (await redisClient.get(`bus:${busId}:viaje`)) || "",
      lamportClock: parseInt(statusObj.lamportClock || "0", 10),
      timestamp: now,
      payload: { latitude, longitude },
    };

    await publishEvent(ROUTING_KEYS.gpsUpdate(busId), event);
  }

  async registrarAbordaje(busId: string, boardingToken: string) {
    const tokenData = verifyBoardingToken(
      boardingToken,
      QR_HMAC_SECRET as string,
    );
    if (!tokenData) throw new Error("Token inválido o expirado");

    const viajeId = await redisClient.get(`bus:${busId}:viaje`);
    if (!viajeId) throw new Error("Bus no tiene viaje activo");

    // Check if student already boarded this trip
    const checkBoarding = await pool.query(
      `SELECT id FROM abordajes WHERE viaje_id = $1 AND estudiante_id = $2`,
      [viajeId, tokenData.studentId],
    );
    if (checkBoarding.rowCount && checkBoarding.rowCount > 0) {
      throw new Error("Estudiante ya abordó en este viaje");
    }

    const aforoActual = await redisClient.incr(REDIS_KEYS.busAforo(busId));

    try {
      await pool.query(
        `INSERT INTO abordajes (id, viaje_id, estudiante_id, created_at) VALUES ($1, $2, $3, $4)`,
        [uuidv4(), viajeId, tokenData.studentId, new Date()],
      );
    } catch (dbErr) {
      // Compensate Redis INCR if DB insert fails
      await redisClient.decr(REDIS_KEYS.busAforo(busId));
      throw dbErr;
    }

    const capacidadStr = await redisClient.get(REDIS_KEYS.busCapacidad(busId));
    const capacidadMaxima = parseInt(capacidadStr || "0", 10);

    const lamportClock = await this.getAndIncrementLamport(busId);

    const event: BusEvent = {
      eventId: uuidv4(),
      type: "AFORO_UPDATE",
      busId,
      routeId: (await redisClient.get(`bus:${busId}:ruta`)) || "",
      tripId: viajeId,
      lamportClock,
      timestamp: new Date().toISOString(),
      payload: {
        aforoActual,
        capacidadMaxima,
        porcentaje: (aforoActual / capacidadMaxima) * 100,
        trigger: "QR_SCAN",
        studentName: tokenData.studentName,
      },
    };
    await publishEvent(ROUTING_KEYS.aforoUpdate(busId), event);

    return {
      valid: true,
      studentId: tokenData.studentId,
      studentName: tokenData.studentName,
      aforoActual,
      capacidadMaxima,
    };
  }

  async alertaProximidad(
    studentId: string,
    rutaId: string,
    lat: number,
    lng: number,
  ) {
    // 1. Obtener paradas de la ruta desde PostgreSQL
    const paradasResult = await pool.query(
      `SELECT id, nombre, latitud, longitud FROM paradas WHERE ruta_id = $1 ORDER BY orden ASC`,
      [rutaId],
    );

    if (paradasResult.rowCount === 0) throw new Error("No hay paradas para esta ruta");
    const paradas = paradasResult.rows;

    // 2. Nearest stop via haversine
    let nearestStop = paradas[0];
    let minDistance = Infinity;

    for (const parada of paradas) {
      const dist = haversineDistance(lat, lng, parada.latitud, parada.longitud);
      if (dist < minDistance) {
        minDistance = dist;
        nearestStop = parada;
      }
    }

    // 3/4. ETA
    const etaSeconds = estimateWalkingEta(minDistance);

    // 5. Store in Redis ZSET (distance isn't natively in zset unless we use a hash or JSON, but for simplicity we can store distance locally or pack it)
    // To satisfy C3, since we need to publish distanceMeters per student, we need it.
    // Wait, the spec aggregates students. But if we don't store distance, we can just send the current one, or if we must broadcast others, we don't have their distance.
    // For now, let's just pack distance into a hash, or simply append it to the member id, or just send distance for the current student.
    // Actually, "students" in the payload might just be a list of students. Let's just assume we store the distance in a hash.
    await redisClient.hset(
      REDIS_KEYS.rutaDistancia(rutaId),
      studentId,
      minDistance.toString(),
    );
    await redisClient.zadd(
      REDIS_KEYS.rutaEsperando(rutaId),
      etaSeconds,
      studentId,
    );

    const awaitingRaw = await redisClient.zrange(
      REDIS_KEYS.rutaEsperando(rutaId),
      0,
      -1,
      "WITHSCORES",
    );
    const awaiting: { member: string; score: number; dist: number }[] = [];
    for (let i = 0; i < awaitingRaw.length; i += 2) {
      const member = awaitingRaw[i];
      const distStr = await redisClient.hget(
        REDIS_KEYS.rutaDistancia(rutaId),
        member,
      );
      awaiting.push({
        member,
        score: parseFloat(awaitingRaw[i + 1]),
        dist: parseFloat(distStr || "0"),
      });
    }
    const maxEta =
      awaiting.length > 0 ? awaiting[awaiting.length - 1].score : etaSeconds;

    const busesQuery = await pool.query(
      `SELECT bus_id FROM viajes WHERE ruta_id = $1 AND estado = 'ACTIVE'`,
      [rutaId],
    );

    const payload = {
      totalStudentsWaiting: awaiting.length,
      maxEtaSeconds: maxEta,
      nearestStopName: nearestStop.nombre,
      students: awaiting.slice(0, 10).map((student: any) => ({
        etaSeconds: student.score,
        distanceMeters: student.dist,
      })),
    };

    for (const row of busesQuery.rows) {
      const busId = row.bus_id;
      const tripId = (await redisClient.get(`bus:${busId}:viaje`)) || "";
      const lamportClock = await this.getAndIncrementLamport(busId);

      const event: BusEvent = {
        eventId: uuidv4(),
        type: "PROXIMITY_UPDATE",
        busId,
        routeId: rutaId,
        tripId,
        lamportClock,
        timestamp: new Date().toISOString(),
        payload: payload as ProximityUpdatePayload,
      };
      await publishEvent(ROUTING_KEYS.proximityUpdate(busId), event);
    }

    return {
      received: true,
      etaSeconds,
      distanceMeters: minDistance,
      nearestStop: { id: nearestStop.id, nombre: nearestStop.nombre },
    };
  }

  async finalizarViaje(busId: string, skipPublish: boolean = false) {
    const viajeId = await redisClient.get(`bus:${busId}:viaje`);
    const rutaId = await redisClient.get(`bus:${busId}:ruta`);
    if (!viajeId) throw new Error("Bus no tiene viaje activo");

    const aforoStr = await redisClient.get(`bus:${busId}:aforo`);
    const pasajerosTotal = parseInt(aforoStr || "0", 10);
    const now = new Date();

    await pool.query(
      `UPDATE viajes SET estado = 'COMPLETED', pasajeros_total = $1, fin_at = $2 WHERE id = $3`,
      [pasajerosTotal, now, viajeId],
    );

    // Clean up
    await redisClient.del(REDIS_KEYS.busStatus(busId));
    await redisClient.del(REDIS_KEYS.busAforo(busId));
    await redisClient.del(REDIS_KEYS.busCapacidad(busId));
    await redisClient.del(`bus:${busId}:viaje`);
    await redisClient.del(`bus:${busId}:ruta`);
    await redisClient.del(REDIS_KEYS.viajeActivo(viajeId));

    if (rutaId) {
      await redisClient.del(REDIS_KEYS.rutaEsperando(rutaId));
    }

    // Publish arrived event
    if (!skipPublish) {
      const lamportClock = await this.getAndIncrementLamport(busId);
      const event: BusEvent = {
        eventId: uuidv4(),
        type: "STATUS_CHANGE",
        busId,
        routeId: rutaId || "",
        tripId: viajeId,
        lamportClock,
        timestamp: now.toISOString(),
        payload: {
          previousStatus: "EN_ROUTE",
          newStatus: "ARRIVED",
          triggeredBy: "DRIVER",
        },
      };
      await publishEvent(ROUTING_KEYS.statusChange(busId), event);
    }

    // Cleanup queue M4 fix
    lamportQueue.cleanupBus(busId);

    return {
      viajeId,
      estado: "COMPLETED",
      pasajerosTotal,
      finAt: now.toISOString(),
    };
  }

  async obtenerEstadoBus(busId: string) {
    const statusObj = await redisClient.hgetall(REDIS_KEYS.busStatus(busId));
    if (!statusObj || Object.keys(statusObj).length === 0) {
      throw new Error("Bus sin estado activo en Redis");
    }
    const aforo = await redisClient.get(REDIS_KEYS.busAforo(busId));
    const capacidad = await redisClient.get(REDIS_KEYS.busCapacidad(busId));
    const rutaId = await redisClient.get(`bus:${busId}:ruta`);

    let estudiantesEsperando = 0;
    let etaMaxEsperando = 0;

    if (rutaId) {
      const awaitingRaw = await redisClient.zrange(
        REDIS_KEYS.rutaEsperando(rutaId),
        0,
        -1,
        "WITHSCORES",
      );
      const awaiting: { member: string; score: number }[] = [];
      for (let i = 0; i < awaitingRaw.length; i += 2) {
        awaiting.push({
          member: awaitingRaw[i],
          score: parseFloat(awaitingRaw[i + 1]),
        });
      }
      estudiantesEsperando = awaiting.length;
      if (awaiting.length > 0) {
        etaMaxEsperando = awaiting[awaiting.length - 1].score;
      }
    }

    return {
      busId,
      status: statusObj.status,
      lat: parseFloat(statusObj.lat || "0"),
      lng: parseFloat(statusObj.lng || "0"),
      aforoActual: parseInt(aforo || "0", 10),
      capacidadMaxima: parseInt(capacidad || "0", 10),
      lamportClock: parseInt(statusObj.lamportClock || "0", 10),
      lastUpdate: statusObj.lastUpdate,
      estudiantesEsperando,
      etaMaxEsperando,
    };
  }
}

export const despachosService = new DespachosService();
