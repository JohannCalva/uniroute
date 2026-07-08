import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Retry-pattern / buffer de eventos ante fallas de omisión (S2/S3/S8).
 *
 * Cuando el conductor pierde conexión, los eventos con estado (cambio de estado
 * del bus) se retienen localmente CON su lamportClock original y se reintentan
 * automáticamente al recuperar la red, en orden FIFO (respetando la causalidad
 * de Lamport). El buffer se persiste en localStorage para sobrevivir a un cierre
 * accidental del navegador.
 *
 * El GPS NO se encola aquí (es efímero: un GPS de hace 30s no aporta valor);
 * el emisor de GPS simplemente se salta el envío mientras no hay red.
 */

export type PendingEvent = {
  id: string;
  endpoint: string;
  method: string;
  /** Body completo, incluye el lamportClock ORIGINAL con el que se generó. */
  body: Record<string, unknown>;
  /** Momento en que el conductor generó el evento (ms epoch). */
  generatedAt: number;
};

const STORAGE_KEY = 'uniroute_conductor_pending_events';

function loadBuffer(): PendingEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveBuffer(buffer: PendingEvent[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buffer));
  } catch {
    /* almacenamiento no disponible: se pierde solo la persistencia, no el buffer en memoria */
  }
}

type UseEventBufferOptions = {
  /** Valor del header Authorization (`Bearer <token>`) o null si no hay sesión. */
  token: string | null;
};

export function useEventBuffer({ token }: UseEventBufferOptions) {
  // useRef para NO forzar re-render en cada mutación del buffer.
  const bufferRef = useRef<PendingEvent[]>(loadBuffer());
  const flushingRef = useRef(false);

  const [pendingCount, setPendingCount] = useState<number>(bufferRef.current.length);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [justSynced, setJustSynced] = useState(false);

  const persistBuffer = useCallback(() => {
    saveBuffer(bufferRef.current);
    setPendingCount(bufferRef.current.length);
  }, []);

  /** Retiene un evento en el buffer (FIFO). Preserva su lamportClock original. */
  const enqueue = useCallback(
    (event: { endpoint: string; method: string; body: Record<string, unknown>; generatedAt?: number }) => {
      const entry: PendingEvent = {
        id: `${event.generatedAt ?? Date.now()}-${bufferRef.current.length}-${Math.floor(
          performance.now(),
        )}`,
        endpoint: event.endpoint,
        method: event.method,
        body: event.body,
        generatedAt: event.generatedAt ?? Date.now(),
      };
      bufferRef.current = [...bufferRef.current, entry];
      persistBuffer();
    },
    [persistBuffer],
  );

  /**
   * Intenta vaciar el buffer en orden FIFO.
   * - Éxito (2xx): se remueve el evento.
   * - Falla de red o 5xx (transitoria): se detiene y se conserva para el próximo intento.
   * - 4xx (error de cliente, evento ya no válido): se descarta para no bloquear la cola.
   */
  const flush = useCallback(async () => {
    if (flushingRef.current) return;
    if (!token) return; // sin sesión, no hay a quién enviar
    if (bufferRef.current.length === 0) return;

    flushingRef.current = true;
    let syncedAny = false;

    try {
      while (bufferRef.current.length > 0) {
        const next = bufferRef.current[0];
        try {
          const res = await fetch(next.endpoint, {
            method: next.method,
            headers: { 'Content-Type': 'application/json', Authorization: token },
            body: JSON.stringify(next.body),
          });

          if (res.ok) {
            bufferRef.current = bufferRef.current.slice(1);
            persistBuffer();
            syncedAny = true;
            continue;
          }

          if (res.status >= 500) {
            // Falla transitoria del servidor: conservar y reintentar luego.
            break;
          }

          // 4xx: el evento ya no es válido (p.ej. el viaje terminó). Descartar.
          console.warn(
            `[event-buffer] evento descartado por respuesta ${res.status}:`,
            next.endpoint,
          );
          bufferRef.current = bufferRef.current.slice(1);
          persistBuffer();
        } catch {
          // Falla de red: seguimos offline. Conservar todo para el próximo 'online'.
          break;
        }
      }
    } finally {
      flushingRef.current = false;
      if (syncedAny && bufferRef.current.length === 0) {
        setJustSynced(true);
        setTimeout(() => setJustSynced(false), 3000);
      }
    }
  }, [token, persistBuffer]);

  // Listeners de conectividad: al volver la red, sincronizar el buffer.
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void flush();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [flush]);

  // Al montar / iniciar sesión: si hay eventos pendientes y hay red, sincronizar.
  useEffect(() => {
    if (token && navigator.onLine && bufferRef.current.length > 0) {
      void flush();
    }
  }, [token, flush]);

  // Reintento periódico de respaldo: cubre fallas transitorias donde navigator.onLine
  // sigue en true (p.ej. el servidor devolvió 5xx o el fetch se bloqueó sin cambiar de estado).
  useEffect(() => {
    if (pendingCount === 0) return;
    const timer = setInterval(() => {
      if (navigator.onLine) void flush();
    }, 10000);
    return () => clearInterval(timer);
  }, [pendingCount, flush]);

  return { isOnline, pendingCount, justSynced, enqueue, flush };
}
