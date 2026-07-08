import { useState, useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { io, Socket } from 'socket.io-client';
import { useEventBuffer } from './useEventBuffer';

type BusStatus = 'AT_STOP' | 'DEPARTING' | 'EN_ROUTE' | 'FULL' | 'ARRIVED';
type AuthData = { token: string; user: { id: string; nombre: string } } | null;

export default function App() {
    const [auth, setAuth] = useState<AuthData>(() => {
        const stored = localStorage.getItem('uniroute_conductor');
        return stored ? JSON.parse(stored) : null;
    });

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errorLogin, setErrorLogin] = useState('');

    const [buses, setBuses] = useState<any[]>([]);
    const [rutas, setRutas] = useState<any[]>([]);
    // La sesión de viaje se rehidrata desde localStorage para sobrevivir a una
    // recarga del navegador / relanzamiento de la PWA (el backend mantiene el viaje activo).
    const [busId, setBusId] = useState(() => localStorage.getItem('uniroute_busId') || '');
    const [rutaId, setRutaId] = useState(() => localStorage.getItem('uniroute_rutaId') || '');
    const [viajeActivo, setViajeActivo] = useState(() => localStorage.getItem('uniroute_viajeActivo') === 'true');

    const [activeTab, setActiveTab] = useState<'panel' | 'escaner'>('panel');
    const [estadoActual, setEstadoActual] = useState<BusStatus>(() => (localStorage.getItem('uniroute_estadoBus') as BusStatus) || 'AT_STOP');
    const [lamportClock, setLamportClock] = useState(() => Number(localStorage.getItem('uniroute_lamport') || '0'));
    const [transmitiendoGps, setTransmitiendoGps] = useState(false);
    const [alertaProximidad, setAlertaProximidad] = useState<{ total: number, maxEta: number } | null>(null);
    const [scanResult, setScanResult] = useState<{ success: boolean; mensaje: string } | null>(null);
    const [cargando, setCargando] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);

    const getHeaders = () => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth?.token}` });

    // Buffer de eventos con retry-pattern (S2/S3/S8). Se sincroniza solo al recuperar red.
    const { isOnline, pendingCount, justSynced, enqueue, flush } = useEventBuffer({
        token: auth ? `Bearer ${auth.token}` : null,
    });

    const flashFeedback = (mensaje: string) => {
        setFeedback(mensaje);
        setTimeout(() => setFeedback((actual) => (actual === mensaje ? null : actual)), 4000);
    };

    // Al iniciar sesión, si quedaron eventos pendientes de una sesión previa, intentar enviarlos.
    useEffect(() => {
        if (auth?.token) void flush();
    }, [auth?.token, flush]);

    // Persistir/limpiar la sesión de viaje en un solo lugar. Al recargar la PWA,
    // el conductor vuelve directo a su viaje en curso (bus, ruta, estado y reloj Lamport).
    // Se limpia solo cuando termina el viaje (ARRIVED / finalizar) o cierra sesión.
    useEffect(() => {
        if (viajeActivo) {
            localStorage.setItem('uniroute_viajeActivo', 'true');
            localStorage.setItem('uniroute_busId', busId);
            localStorage.setItem('uniroute_rutaId', rutaId);
            localStorage.setItem('uniroute_estadoBus', estadoActual);
            localStorage.setItem('uniroute_lamport', String(lamportClock));
        } else {
            localStorage.removeItem('uniroute_viajeActivo');
            localStorage.removeItem('uniroute_busId');
            localStorage.removeItem('uniroute_rutaId');
            localStorage.removeItem('uniroute_estadoBus');
            localStorage.removeItem('uniroute_lamport');
        }
    }, [viajeActivo, busId, rutaId, estadoActual, lamportClock]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorLogin('');
        try {
            const res = await fetch('/api/v1/usuarios/login', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const loginResponse = await res.json();
            if (res.ok) {
                if (loginResponse.user.rol !== 'DRIVER') return setErrorLogin('Acceso denegado. Se requiere rol de Conductor.');
                setAuth(loginResponse); localStorage.setItem('uniroute_conductor', JSON.stringify(loginResponse));
            } else { setErrorLogin('Credenciales inválidas'); }
        } catch { setErrorLogin('Error de conexión'); }
    };

    const handleLogout = () => { setAuth(null); localStorage.removeItem('uniroute_conductor'); setViajeActivo(false); setTransmitiendoGps(false); };

    useEffect(() => {
        if (!auth || viajeActivo) return;
        fetch('/api/v1/buses', { headers: getHeaders() }).then(res => res.json()).then(body => setBuses(body.data || []));
        fetch('/api/v1/rutas?activa=true', { headers: getHeaders() }).then(res => res.json()).then(body => setRutas(body.data || []));
    }, [auth, viajeActivo]);

    const iniciarViaje = async () => {
        if (!busId || !rutaId) return alert("Seleccione Bus y Ruta");
        try {
            const res = await fetch('/api/v1/despachos/viaje/iniciar', {
                method: 'POST', headers: getHeaders(), body: JSON.stringify({ busId, rutaId })
            });
            if (res.ok) { setViajeActivo(true); setEstadoActual('AT_STOP'); setLamportClock(0); }
            else alert("Error: El bus podría tener un viaje activo.");
        } catch (e) { alert("Error iniciando viaje"); }
    };

    const cambiarEstadoBus = async (nuevoEstado: BusStatus) => {
        if (estadoActual === nuevoEstado) return;
        setCargando(true);

        // Regla 1 de Lamport: incrementar SIEMPRE el reloj local antes de emitir,
        // haya o no conexión, para preservar la secuencia causal del evento.
        const nuevoReloj = lamportClock + 1;
        setLamportClock(nuevoReloj);

        const endpoint = '/api/v1/despachos/estado';
        const body = { busId, status: nuevoEstado, lamportClock: nuevoReloj };

        // UI optimista: reflejar de inmediato la intención del conductor.
        setEstadoActual(nuevoEstado);

        try {
            if (!navigator.onLine) throw new Error('offline');

            const res = await fetch(endpoint, {
                method: 'POST', headers: getHeaders(), body: JSON.stringify(body),
            });

            if (res.ok) {
                const statusResponse = await res.json();
                if (statusResponse.serverLamportClock) setLamportClock(Math.max(nuevoReloj, statusResponse.serverLamportClock));
            } else if (res.status >= 500) {
                // Falla transitoria del servidor: retener para reintento.
                throw new Error('server');
            }
            // 4xx: error de cliente (estado inválido), no se reintenta.
        } catch {
            // Offline o falla transitoria: retener el evento con su lamportClock ORIGINAL,
            // nunca descartarlo. Se reenviará automáticamente al recuperar conexión.
            enqueue({ endpoint, method: 'POST', body });
            flashFeedback('📥 Evento guardado, se enviará al recuperar conexión.');
        } finally {
            // El backend finaliza el viaje al procesar ARRIVED (sea ahora o al sincronizar).
            if (nuevoEstado === 'ARRIVED') finalizarViajeLocal();
            setCargando(false);
        }
    };

    const finalizarViajeLocal = () => {
        // El backend ya finaliza el viaje al procesar el cambio de estado a ARRIVED
        setTransmitiendoGps(false);
        setViajeActivo(false);
        alert("Viaje finalizado correctamente.");
    };

    useEffect(() => {
        if (!viajeActivo) return;
        const socket: Socket = io('/', { path: '/socket.io/', transports: ['websocket'] });
        socket.on('connect', () => socket.emit('subscribe:driver', { busId }));
        socket.on('proximity:update', (proximityEvent) => setAlertaProximidad({ total: proximityEvent.totalStudentsWaiting, maxEta: proximityEvent.maxEtaSeconds }));
        return () => { socket.disconnect(); };
    }, [viajeActivo, busId]);

    useEffect(() => {
        let watchId: number;
        let wakeLock: any = null;

        const iniciarGps = async () => {
            try {
                if ('wakeLock' in navigator) wakeLock = await (navigator as any).wakeLock.request('screen');
            } catch (err) { console.warn("Wake Lock no soportado", err); }

            if (navigator.geolocation) {
                watchId = navigator.geolocation.watchPosition(
                    (pos) => {
                        // El GPS es efímero: si no hay red, se omite el envío (no se encola).
                        // watchPosition sigue disparando, así que se reanuda solo al volver la red.
                        if (!navigator.onLine) return;
                        fetch('/api/v1/despachos/gps', {
                            method: 'POST', headers: getHeaders(),
                            body: JSON.stringify({ busId, latitude: pos.coords.latitude, longitude: pos.coords.longitude })
                        }).catch(() => {});
                    },
                    () => {}, { enableHighAccuracy: true, maximumAge: 0 }
                );
            }
        };

        if (transmitiendoGps) iniciarGps();

        return () => {
            if (watchId) navigator.geolocation.clearWatch(watchId);
            if (wakeLock) wakeLock.release().catch(() => {});
        };
    }, [transmitiendoGps, busId]);

    useEffect(() => {
        if (activeTab !== 'escaner' || !viajeActivo) return;
        setScanResult(null);
        const scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
        scanner.render(
            async (decodedText) => {
                scanner.pause(true);
                try {
                    const response = await fetch('/api/v1/despachos/abordaje', {
                        method: 'POST', headers: getHeaders(), body: JSON.stringify({ busId, boardingToken: decodedText })
                    });
                    const abordajeResponse = await response.json();
                    if (response.ok) {
                        setScanResult({ success: true, mensaje: `✅ Pasajero: ${abordajeResponse.studentName} - Aforo: ${abordajeResponse.aforoActual}/${abordajeResponse.capacidadMaxima}` });
                    } else {
                        setScanResult({ success: false, mensaje: `❌ ${abordajeResponse.error || 'Token inválido'}` });
                    }
                } catch { setScanResult({ success: false, mensaje: "❌ Error de conexión." }); }
                setTimeout(() => { setScanResult(null); scanner.resume(); }, 3000);
            }, () => {}
        );
        return () => { scanner.clear().catch(console.error); };
    }, [activeTab, viajeActivo]);

    if (!auth) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4 font-sans">
                <form onSubmit={handleLogin} className="bg-gray-800 p-8 rounded-xl shadow-2xl w-full max-w-sm border border-gray-700">
                    <h1 className="text-2xl font-bold text-red-500 mb-6 text-center">Portal Conductor</h1>
                    {errorLogin && <p className="bg-red-500/20 text-red-400 p-3 rounded mb-4 text-sm font-semibold border border-red-500/50">{errorLogin}</p>}
                    <input type="email" placeholder="Correo de Conductor" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-3 mb-4 bg-gray-900 border border-gray-700 rounded text-white outline-none focus:border-red-500 transition-colors" required />
                    <input type="password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 mb-6 bg-gray-900 border border-gray-700 rounded text-white outline-none focus:border-red-500 transition-colors" required />
                    <button type="submit" className="w-full bg-red-600 text-white font-bold py-3 rounded-lg hover:bg-red-700 transition-colors">Entrar</button>
                </form>
            </div>
        );
    }

    if (!viajeActivo) {
        return (
            <div className="min-h-screen bg-gray-900 p-6 flex flex-col items-center text-white font-sans">
                <div className="w-full max-w-sm flex justify-between items-center mb-8">
                    <h1 className="text-xl font-bold text-red-500 tracking-tight">Configurar Viaje</h1>
                    <button onClick={handleLogout} className="text-sm bg-gray-800 px-3 py-1 rounded border border-gray-700 hover:bg-gray-700 transition-colors">Salir</button>
                </div>
                <div className="w-full max-w-sm bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-xl">
                    <label className="block mb-2 text-gray-400 text-sm font-bold uppercase tracking-wider">Unidad (Bus)</label>
                    <select className="w-full p-3 mb-6 bg-gray-900 border border-gray-700 rounded outline-none focus:border-red-500 text-white transition-colors" onChange={e => setBusId(e.target.value)} value={busId}>
                        <option value="" disabled>Seleccione un bus</option>
                        {buses.map(b => <option key={b.id} value={b.id}>{b.placa} ({b.capacidadMaxima} as.)</option>)}
                    </select>

                    <label className="block mb-2 text-gray-400 text-sm font-bold uppercase tracking-wider">Ruta Asignada</label>
                    <select className="w-full p-3 mb-8 bg-gray-900 border border-gray-700 rounded outline-none focus:border-red-500 text-white transition-colors" onChange={e => setRutaId(e.target.value)} value={rutaId}>
                        <option value="" disabled>Seleccione la ruta</option>
                        {rutas.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                    </select>

                    <button onClick={iniciarViaje} className="w-full bg-green-600 text-white font-black text-lg py-4 rounded-xl hover:bg-green-500 transition-colors shadow-lg">▶ INICIAR RECORRIDO</button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col bg-gray-900 text-white font-sans">
            <header className="bg-black p-5 shadow-lg border-b border-gray-800 flex justify-between items-center z-10">
                <div>
                    <h1 className="text-2xl font-bold text-red-600 tracking-tight leading-none">UniRoute</h1>
                    <span className="text-xs text-gray-400 font-medium">Conductor: {auth.user.nombre}</span>
                </div>
                <div className="flex items-center gap-4">
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold uppercase ${isOnline ? 'bg-green-900/40 border-green-700 text-green-300' : 'bg-red-900/40 border-red-700 text-red-300'}`}>
                        <span className={`inline-block h-2 w-2 rounded-full ${isOnline ? 'bg-green-400' : 'bg-red-400 animate-pulse'}`} />
                        {isOnline ? 'En línea' : 'Sin conexión'}
                    </div>
                    {pendingCount > 0 && (
                        <div className="flex items-center gap-1.5 bg-amber-900/40 px-3 py-1.5 rounded-full border border-amber-700 text-xs font-bold text-amber-300" title="Eventos guardados pendientes de reenvío">
                            📥 {pendingCount} pendiente{pendingCount > 1 ? 's' : ''}
                        </div>
                    )}
                    <div className="flex items-center gap-2 bg-gray-900 px-3 py-1.5 rounded-full border border-gray-800">
                        <span className="text-xs font-bold text-gray-400 uppercase">GPS</span>
                        <button onClick={() => setTransmitiendoGps(!transmitiendoGps)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${transmitiendoGps ? 'bg-red-600' : 'bg-gray-600'}`}>
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${transmitiendoGps ? 'translate-x-6 shadow-md' : 'translate-x-1'}`} />
                        </button>
                    </div>
                    <button onClick={handleLogout} className="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded-lg border border-gray-700 transition-colors font-bold uppercase">Salir</button>
                </div>
            </header>

            <nav className="bg-gray-950 border-b border-gray-800 flex shadow-inner z-0">
                <button onClick={() => setActiveTab('panel')} className={`flex-1 py-4 text-sm font-bold tracking-widest uppercase transition-colors border-b-4 ${activeTab === 'panel' ? 'border-red-600 text-white' : 'border-transparent text-gray-600 hover:text-gray-400'}`}>Tablero</button>
                <button onClick={() => setActiveTab('escaner')} className={`flex-1 py-4 text-sm font-bold tracking-widest uppercase transition-colors border-b-4 ${activeTab === 'escaner' ? 'border-red-600 text-white' : 'border-transparent text-gray-600 hover:text-gray-400'}`}>Escáner</button>
            </nav>

            <main className="flex-1 container mx-auto p-4 max-w-md flex flex-col justify-center gap-4">
                {feedback && (
                    <div className="animate-fade-in bg-amber-500/20 border border-amber-500/50 text-amber-200 p-3 rounded-2xl text-sm font-bold text-center shadow-lg">
                        {feedback}
                    </div>
                )}
                {justSynced && (
                    <div className="animate-fade-in bg-green-600/20 border border-green-500/50 text-green-200 p-3 rounded-2xl text-sm font-bold text-center shadow-lg">
                        ✓ Eventos sincronizados
                    </div>
                )}
                {pendingCount > 0 && (
                    <div className="animate-fade-in bg-amber-900/30 border border-amber-500/40 text-amber-200 p-3 rounded-2xl text-xs font-semibold text-center">
                        📥 {pendingCount} evento{pendingCount > 1 ? 's' : ''} en cola — se reenviará{pendingCount > 1 ? 'n' : ''} automáticamente al recuperar conexión.
                    </div>
                )}
                {alertaProximidad && alertaProximidad.total > 0 && (
                    <div className="animate-fade-in bg-blue-900/30 border border-blue-500/50 p-4 rounded-2xl flex items-center gap-4 shadow-lg mb-2">
                        <span className="text-4xl drop-shadow-md">🏃‍♂️</span>
                        <div>
                            <p className="text-blue-100 font-black text-sm uppercase tracking-wide">¡Estudiantes en camino!</p>
                            <p className="text-blue-300 text-xs font-semibold mt-1">
                                {alertaProximidad.total} personas acercándose — El más lejano a {Math.round(alertaProximidad.maxEta / 60)} min.
                            </p>
                        </div>
                    </div>
                )}

                {activeTab === 'panel' && (
                    <div className="animate-fade-in flex flex-col gap-4">
                        <div className="bg-gray-800 p-6 rounded-3xl border border-gray-700 shadow-2xl mb-2">
                            <h2 className="text-gray-500 text-xs font-black uppercase tracking-widest mb-3 text-center">Estado Actual</h2>
                            <div className="text-2xl sm:text-3xl font-black text-center text-white flex items-center justify-center gap-3 drop-shadow-sm">
                                {cargando && <span className="animate-spin text-red-500">⏳</span>}
                                {!cargando && estadoActual === 'AT_STOP' && '🛑 En Parada'}
                                {!cargando && estadoActual === 'DEPARTING' && '⚠️ Saliendo en 5 min'}
                                {!cargando && estadoActual === 'EN_ROUTE' && '🚌 En Ruta'}
                                {!cargando && estadoActual === 'FULL' && '🚫 Bus Lleno'}
                                {!cargando && estadoActual === 'ARRIVED' && '🏁 Llegada'}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                            <button onClick={() => cambiarEstadoBus('AT_STOP')} disabled={cargando || estadoActual === 'AT_STOP'} className={`p-5 sm:p-6 rounded-3xl font-black text-base sm:text-lg flex flex-col items-center justify-center gap-2 transition-all active:scale-95 border ${estadoActual === 'AT_STOP' ? 'bg-blue-600 border-blue-500 shadow-[0_0_15px_rgba(37,99,235,0.5)]' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-white'}`}>
                                <span className="text-3xl sm:text-4xl drop-shadow-md mb-1">🛑</span> Parada
                            </button>
                            <button onClick={() => cambiarEstadoBus('DEPARTING')} disabled={cargando || estadoActual === 'DEPARTING'} className={`p-5 sm:p-6 rounded-3xl font-black text-base sm:text-lg flex flex-col items-center justify-center gap-2 transition-all active:scale-95 border ${estadoActual === 'DEPARTING' ? 'bg-orange-500 border-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.5)]' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-white'}`}>
                                <span className="text-3xl sm:text-4xl drop-shadow-md mb-1">⚠️</span> Saliendo
                            </button>
                            <button onClick={() => cambiarEstadoBus('EN_ROUTE')} disabled={cargando || estadoActual === 'EN_ROUTE'} className={`col-span-2 p-5 sm:p-6 rounded-3xl font-black text-base sm:text-lg flex flex-col items-center justify-center gap-2 transition-all active:scale-95 border ${estadoActual === 'EN_ROUTE' ? 'bg-green-600 border-green-500 shadow-[0_0_15px_rgba(22,163,74,0.5)] text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-white'}`}>
                                <span className="text-3xl sm:text-4xl drop-shadow-md mb-1">🚌</span> En Ruta
                            </button>
                            <button onClick={() => cambiarEstadoBus('FULL')} disabled={cargando || estadoActual === 'FULL'} className={`p-5 sm:p-6 rounded-3xl font-black text-base sm:text-lg flex flex-col items-center justify-center gap-2 transition-all active:scale-95 border ${estadoActual === 'FULL' ? 'bg-red-600 border-red-500 shadow-[0_0_15px_rgba(220,38,38,0.5)] text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-white'}`}>
                                <span className="text-3xl sm:text-4xl drop-shadow-md mb-1">🚫</span> Lleno
                            </button>
                            <button onClick={() => cambiarEstadoBus('ARRIVED')} disabled={cargando || estadoActual === 'ARRIVED'} className={`p-5 sm:p-6 rounded-3xl font-black text-base sm:text-lg flex flex-col items-center justify-center gap-2 transition-all active:scale-95 border ${estadoActual === 'ARRIVED' ? 'bg-purple-600 border-purple-500 shadow-[0_0_15px_rgba(147,51,234,0.5)] text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-white'}`}>
                                <span className="text-3xl sm:text-4xl drop-shadow-md mb-1">🏁</span> Fin
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'escaner' && (
                    <div className="animate-fade-in flex flex-col gap-4 h-full pt-4">
                        {scanResult && (
                            <div className={`p-4 rounded-2xl text-center font-black text-lg shadow-lg border animate-fade-in ${scanResult.success ? 'bg-green-600 border-green-500 text-white' : 'bg-red-600 border-red-500 text-white'}`}>
                                {scanResult.mensaje}
                            </div>
                        )}
                        <div className="bg-gray-800 p-4 sm:p-5 rounded-3xl border border-gray-700 shadow-2xl overflow-hidden flex-1 flex flex-col">
                            <h2 className="text-gray-400 text-xs font-black uppercase tracking-widest mb-4 text-center">Enfoque el QR del Pasajero</h2>
                            <div id="reader" className="w-full bg-black rounded-2xl overflow-hidden border-2 border-gray-700 flex-1 min-h-[300px]"></div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}