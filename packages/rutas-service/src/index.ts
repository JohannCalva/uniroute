import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { REDIS_KEYS, BusLiveStatus } from '@uniroute/shared';

const app = express();
const PORT = process.env.PORT || 3002;

// Pool gestiona las conexiones eficientemente usando la variable de entorno
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'rutas-service' });
});

// ==========================================
// T4.6 - ENDPOINTS DE RUTAS
// ==========================================
app.get('/api/v1/rutas', async (req, res) => {
    try {
        const activaParam = req.query.activa;
        let queryRutas = 'SELECT * FROM rutas';
        const queryParams: any[] = [];

        if (activaParam === 'true') {
            queryRutas += ' WHERE activa = $1';
            queryParams.push(true);
        } else if (activaParam === 'false') {
            queryRutas += ' WHERE activa = $1';
            queryParams.push(false);
        }

        const rutasResult = await pool.query(queryRutas, queryParams);
        const rutas = rutasResult.rows;

        if (rutas.length === 0) {
            return res.status(200).json({ data: [], total: 0 });
        }

        const rutaIds = rutas.map(r => r.id);
        const paradasResult = await pool.query(
            'SELECT * FROM paradas WHERE ruta_id = ANY($1::uuid[]) ORDER BY orden ASC',
            [rutaIds]
        );
        const paradas = paradasResult.rows;

        const data = rutas.map(ruta => {
            const paradasRuta = paradas
                .filter(p => p.ruta_id === ruta.id)
                .map(p => ({
                    id: p.id,
                    rutaId: p.ruta_id,
                    nombre: p.nombre,
                    latitud: parseFloat(p.latitud),
                    longitud: parseFloat(p.longitud),
                    orden: p.orden
                }));

            return {
                id: ruta.id,
                nombre: ruta.nombre,
                origen: ruta.origen,
                destino: ruta.destino,
                precio: parseFloat(ruta.precio),
                activa: ruta.activa,
                horarioInicio: ruta.horario_inicio.substring(0, 5),
                horarioFin: ruta.horario_fin.substring(0, 5),
                paradas: paradasRuta
            };
        });

        res.status(200).json({ data, total: data.length });
    } catch (error) {
        console.error('Error consultando rutas:', error);
        res.status(500).json({ error: 'Error interno del servidor', code: 'INTERNAL_SERVER_ERROR' });
    }
});

app.post('/api/v1/rutas', async (req, res) => {
    try {
        const { nombre, origen, destino, precio, horarioInicio, horarioFin } = req.body;
        const result = await pool.query(
            `INSERT INTO rutas (nombre, origen, destino, precio, horario_inicio, horario_fin) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [nombre, origen, destino, precio, horarioInicio, horarioFin]
        );
        res.status(201).json({ message: 'Ruta creada', data: result.rows[0] });
    } catch (error) {
        console.error('Error creando ruta:', error);
        res.status(500).json({ error: 'Error interno', code: 'INTERNAL_SERVER_ERROR' });
    }
});

app.put('/api/v1/rutas/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const { nombre, origen, destino, precio, activa, horarioInicio, horarioFin } = req.body;
        const result = await pool.query(
            `UPDATE rutas SET nombre = $1, origen = $2, destino = $3, precio = $4, 
             activa = $5, horario_inicio = $6, horario_fin = $7 
             WHERE id = $8 RETURNING *`,
            [nombre, origen, destino, precio, activa, horarioInicio, horarioFin, id]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'Ruta no encontrada' });
        res.status(200).json({ message: 'Ruta actualizada', data: result.rows[0] });
    } catch (error) {
        console.error('Error actualizando ruta:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

app.get('/api/v1/rutas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const rutaResult = await pool.query('SELECT * FROM rutas WHERE id = $1', [id]);

        if (rutaResult.rowCount === 0) {
            return res.status(404).json({ error: 'Ruta no encontrada', code: 'NOT_FOUND' });
        }

        const ruta = rutaResult.rows[0];
        const paradasResult = await pool.query(
            'SELECT * FROM paradas WHERE ruta_id = $1 ORDER BY orden ASC',
            [id]
        );

        const paradas = paradasResult.rows.map(p => ({
            id: p.id,
            rutaId: p.ruta_id,
            nombre: p.nombre,
            latitud: parseFloat(p.latitud),
            longitud: parseFloat(p.longitud),
            orden: p.orden
        }));

        res.status(200).json({
            id: ruta.id,
            nombre: ruta.nombre,
            origen: ruta.origen,
            destino: ruta.destino,
            precio: parseFloat(ruta.precio),
            activa: ruta.activa,
            horarioInicio: ruta.horario_inicio.substring(0, 5),
            horarioFin: ruta.horario_fin.substring(0, 5),
            paradas
        });
    } catch (error) {
        console.error('Error consultando ruta por ID:', error);
        res.status(500).json({ error: 'Error interno', code: 'INTERNAL_SERVER_ERROR' });
    }
});

// ==========================================
// T4.7 - ENDPOINTS DE BUSES
// ==========================================
app.get('/api/v1/buses/:id', async (req, res) => {
    try {
        const busId = req.params.id;
        const result = await pool.query(`
            SELECT b.id, b.placa, b.capacidad_maxima,
                   r.id as ruta_id, r.nombre as ruta_nombre
            FROM buses b
                     LEFT JOIN rutas r ON b.ruta_asignada_id = r.id
            WHERE b.id = $1
        `, [busId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Bus no encontrado', code: 'NOT_FOUND' });
        }

        const row = result.rows[0];
        const statusData = await redis.hgetall(REDIS_KEYS.busStatus(busId));
        const aforoData = await redis.get(REDIS_KEYS.busAforo(busId));

        let estadoEnVivo = null;
        if (statusData && Object.keys(statusData).length > 0) {
            estadoEnVivo = {
                status: statusData.status as any,
                lat: parseFloat(statusData.lat),
                lng: parseFloat(statusData.lng),
                aforoActual: aforoData ? parseInt(aforoData, 10) : 0,
                lamportClock: parseInt(statusData.lamportClock || '0', 10),
                lastUpdate: statusData.lastUpdate
            };
        }

        res.status(200).json({
            id: busId,
            placa: row.placa,
            capacidadMaxima: row.capacidad_maxima,
            rutaAsignada: row.ruta_id ? { id: row.ruta_id, nombre: row.ruta_nombre } : null,
            estadoEnVivo
        });
    } catch (error) {
        console.error('Error consultando bus por ID:', error);
        res.status(500).json({ error: 'Error interno', code: 'INTERNAL_SERVER_ERROR' });
    }
});

app.post('/api/v1/buses', async (req, res) => {
    try {
        const { placa, capacidadMaxima } = req.body;
        if (!placa || !capacidadMaxima) {
            return res.status(400).json({ error: 'Placa y capacidad son requeridas', code: 'BAD_REQUEST' });
        }

        const result = await pool.query(
            `INSERT INTO buses (placa, capacidad_maxima)
             VALUES ($1, $2) RETURNING id, placa, capacidad_maxima`,
            [placa, capacidadMaxima]
        );

        res.status(201).json({ message: 'Bus creado exitosamente', data: result.rows[0] });
    } catch (error: any) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'La placa ya está registrada', code: 'CONFLICT' });
        }
        res.status(500).json({ error: 'Error interno del servidor', code: 'INTERNAL_SERVER_ERROR' });
    }
});

app.put('/api/v1/buses/:id/asignar', async (req, res) => {
    try {
        const busId = req.params.id;
        const { rutaId } = req.body;

        const result = await pool.query(
            `UPDATE buses SET ruta_asignada_id = $1 WHERE id = $2 RETURNING id`,
            [rutaId, busId]
        );

        if (result.rowCount === 0) return res.status(404).json({ error: 'Bus no encontrado', code: 'NOT_FOUND' });
        res.status(200).json({ message: 'Ruta asignada exitosamente' });
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor', code: 'INTERNAL_SERVER_ERROR' });
    }
});

// ==========================================
// T4.8 - ENDPOINTS CRUD DE PARADAS
// ==========================================
app.get('/api/v1/rutas/:rutaId/paradas', async (req, res) => {
    try {
        const { rutaId } = req.params;
        const result = await pool.query(
            'SELECT * FROM paradas WHERE ruta_id = $1 ORDER BY orden ASC',
            [rutaId]
        );

        const data = result.rows.map(p => ({
            id: p.id,
            rutaId: p.ruta_id,
            nombre: p.nombre,
            latitud: parseFloat(p.latitud),
            longitud: parseFloat(p.longitud),
            orden: p.orden
        }));

        res.status(200).json({ data, total: data.length });
    } catch (error) {
        console.error('Error consultando paradas:', error);
        res.status(500).json({ error: 'Error interno', code: 'INTERNAL_SERVER_ERROR' });
    }
});

app.put('/api/v1/paradas/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const { nombre, latitud, longitud, orden } = req.body;
        const result = await pool.query(
            `UPDATE paradas SET nombre = $1, latitud = $2, longitud = $3, orden = $4
             WHERE id = $5 RETURNING *`,
            [nombre, latitud, longitud, orden, id]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'Parada no encontrada' });
        res.status(200).json({ message: 'Parada actualizada', data: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: 'Error interno' });
    }
});

// ==========================================
// T4.9 - ENDPOINT HISTORIAL DE VIAJES
// ==========================================
app.get('/api/v1/viajes/historial', async (req, res) => {
    try {
        // Hacemos un JOIN con todas las tablas relacionadas para traer datos legibles
        const query = `
            SELECT 
                v.id, 
                b.placa, 
                r.nombre as ruta, 
                u.nombre as conductor, 
                TO_CHAR(v.inicio_at, 'YYYY-MM-DD HH24:MI') as inicio, 
                TO_CHAR(v.fin_at, 'YYYY-MM-DD HH24:MI') as fin, 
                v.pasajeros_total as pasajeros, 
                v.estado
            FROM viajes v
            JOIN buses b ON v.bus_id = b.id
            JOIN rutas r ON v.ruta_id = r.id
            JOIN usuarios u ON v.conductor_id = u.id
            ORDER BY v.inicio_at DESC
            LIMIT 50
        `;

        const result = await pool.query(query);

        res.status(200).json({
            data: result.rows,
            total: result.rowCount
        });
    } catch (error) {
        console.error('Error consultando historial:', error);
        res.status(500).json({ error: 'Error interno del servidor', code: 'INTERNAL_SERVER_ERROR' });
    }
});

app.listen(PORT, () => {
    console.log(`rutas-service running on port ${PORT}`);
});