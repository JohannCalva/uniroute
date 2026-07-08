import { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { io, Socket } from 'socket.io-client';

// @ts-ignore
import icon from 'leaflet/dist/images/marker-icon.png';
// @ts-ignore
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconAnchor: [12, 41], popupAnchor: [1, -34] });
L.Marker.prototype.options.icon = DefaultIcon;

type AuthData = { token: string; user: { id: string; email: string } } | null;
type Headers = () => Record<string, string>;

type Parada = { id: string; nombre: string; latitud: number; longitud: number; orden: number };
type Ruta = { id: string; nombre: string; origen: string; destino: string; precio: number; activa: boolean; horarioInicio: string; horarioFin: string; paradas: Parada[] };
type Bus = { id: string; placa: string; capacidadMaxima: number; rutaAsignada: { id: string; nombre: string } | null; estadoEnVivo: any };
type Usuario = { id: string; nombre: string; email: string; rol: string; createdAt: string };

type Tab = 'flota' | 'historial' | 'rutas' | 'buses' | 'usuarios';

// Helper de red centralizado: adjunta headers de auth y normaliza errores del backend.
async function api<T = any>(path: string, getHeaders: Headers, opts: RequestInit = {}): Promise<T> {
    const res = await fetch(path, { ...opts, headers: getHeaders() });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((body as any).error || `Error ${res.status}`);
    return body as T;
}

export default function App() {
    const [auth, setAuth] = useState<AuthData>(() => {
        const stored = localStorage.getItem('uniroute_admin_auth');
        return stored ? JSON.parse(stored) : null;
    });

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errorLogin, setErrorLogin] = useState('');

    const [activeTab, setActiveTab] = useState<Tab>('flota');
    const [flota, setFlota] = useState<Record<string, any>>({});
    const [historial, setHistorial] = useState<any[]>([]);
    const [cargandoHistorial, setCargandoHistorial] = useState(false);

    const getHeaders: Headers = useCallback(
        () => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth?.token}` }),
        [auth],
    );

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
                if (loginResponse.user.rol !== 'ADMIN') return setErrorLogin('Acceso denegado. Rol ADMIN requerido.');
                setAuth(loginResponse); localStorage.setItem('uniroute_admin_auth', JSON.stringify(loginResponse));
            } else { setErrorLogin('Credenciales inválidas'); }
        } catch { setErrorLogin('Error de red'); }
    };

    const handleLogout = () => { setAuth(null); localStorage.removeItem('uniroute_admin_auth'); };

    // Recarga la foto de flota (buses con estado en vivo) desde el backend.
    const recargarFlota = useCallback(() => {
        fetch('/api/v1/buses', { headers: getHeaders() })
            .then(res => res.json())
            .then(busesResponse => {
                const mapBuses: any = {};
                (busesResponse.data || []).forEach((bus: any) => {
                    if (bus.estadoEnVivo) {
                        mapBuses[bus.id] = { ...bus.estadoEnVivo, id: bus.id, placa: bus.placa, rutaNombre: bus.rutaAsignada?.nombre, capacidadMaxima: bus.capacidadMaxima };
                    }
                });
                setFlota(mapBuses);
            });
    }, [getHeaders]);

    // Finalización de viaje por parte del admin (p.ej. si el conductor lo olvidó).
    // El backend lo cierra como COMPLETED y publica ARRIVED, así que estudiantes y
    // el propio panel se actualizan. Luego recargamos la flota para quitar la unidad.
    const finalizarViajeAdmin = async (busId: string, placa: string) => {
        if (!confirm(`¿Finalizar el viaje del bus ${placa}?\nSe cerrará como si el conductor hubiera marcado LLEGADA.`)) return;
        try {
            await api('/api/v1/despachos/viaje/finalizar', getHeaders, { method: 'POST', body: JSON.stringify({ busId }) });
            recargarFlota();
        } catch (e: any) {
            alert(e.message || 'No se pudo finalizar el viaje.');
        }
    };

    // Flota (en vivo) e Historial: solo activos en sus pestañas.
    useEffect(() => {
        if (!auth) return;
        if (activeTab === 'flota') {
            recargarFlota();

            const socket: Socket = io('/', { path: '/socket.io/', transports: ['websocket'] });
            socket.on('connect', () => socket.emit('subscribe:admin'));
            socket.on('bus:gps', (gpsEvent) => setFlota(prevFlota => prevFlota[gpsEvent.busId] ? { ...prevFlota, [gpsEvent.busId]: { ...prevFlota[gpsEvent.busId], lat: gpsEvent.payload.latitude, lng: gpsEvent.payload.longitude } } : prevFlota));
            socket.on('bus:status', (statusEvent) => setFlota(prevFlota => prevFlota[statusEvent.busId] ? { ...prevFlota, [statusEvent.busId]: { ...prevFlota[statusEvent.busId], status: statusEvent.payload.newStatus } } : prevFlota));
            socket.on('bus:aforo', (aforoEvent) => setFlota(prevFlota => prevFlota[aforoEvent.busId] ? { ...prevFlota, [aforoEvent.busId]: { ...prevFlota[aforoEvent.busId], aforoActual: aforoEvent.payload.aforoActual } } : prevFlota));
            return () => { socket.disconnect(); };
        } else if (activeTab === 'historial') {
            setCargandoHistorial(true);
            fetch('/api/v1/viajes/historial', { headers: getHeaders() })
                .then(res => res.json())
                .then(historialResponse => setHistorial(historialResponse.data || []))
                .finally(() => setCargandoHistorial(false));
        }
    }, [auth, activeTab, getHeaders, recargarFlota]);

    if (!auth) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 font-sans p-4">
                <form onSubmit={handleLogin} className="bg-white p-8 shadow-2xl rounded-2xl w-full max-w-sm border border-gray-200">
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Dashboard Admin</h1>
                        <p className="text-sm text-gray-500 mt-2 font-medium">Control de Flota UniRoute</p>
                    </div>
                    {errorLogin && <div className="bg-red-50 text-red-600 p-3 rounded-xl mb-6 text-sm font-bold border border-red-100 text-center">{errorLogin}</div>}
                    <div className="space-y-4 mb-8">
                        <input type="email" placeholder="Correo Administrativo" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-4 border border-gray-300 rounded-xl outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all font-medium" required />
                        <input type="password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-4 border border-gray-300 rounded-xl outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all font-medium" required />
                    </div>
                    <button type="submit" className="w-full bg-gray-900 text-white font-bold text-lg py-4 rounded-xl hover:bg-gray-800 transition-all shadow-md active:scale-[0.98]">Acceder al Sistema</button>
                </form>
            </div>
        );
    }

    const tabs: { key: Tab; label: string }[] = [
        { key: 'flota', label: '📡 Mapa de Flota' },
        { key: 'historial', label: '📊 Historial' },
        { key: 'rutas', label: '🛣️ Rutas' },
        { key: 'buses', label: '🚌 Buses' },
        { key: 'usuarios', label: '👥 Usuarios' },
    ];

    return (
        <div className="min-h-screen flex flex-col bg-gray-100 font-sans">
            <header className="bg-gray-900 text-white p-4 shadow-md flex justify-between items-center z-20">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-black text-red-500 tracking-tight">UniRoute</h1>
                    <span className="bg-red-600 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider hidden sm:inline-block shadow-sm">Centro de Mando</span>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Administrador</p>
                        <p className="text-sm font-medium">{auth.user.email}</p>
                    </div>
                    <button onClick={handleLogout} className="text-xs bg-gray-800 border border-gray-700 px-4 py-2.5 rounded-lg hover:bg-gray-700 transition-colors font-bold uppercase tracking-wide">Cerrar Sesión</button>
                </div>
            </header>

            <nav className="bg-white border-b border-gray-200 flex shadow-sm z-10 overflow-x-auto">
                {tabs.map(t => (
                    <button key={t.key} onClick={() => setActiveTab(t.key)} className={`py-4 px-6 text-sm font-black uppercase tracking-widest whitespace-nowrap transition-colors ${activeTab === t.key ? 'border-b-4 border-red-600 text-gray-900 bg-gray-50' : 'border-b-4 border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}>{t.label}</button>
                ))}
            </nav>

            <main className="flex-1 flex overflow-hidden">
                {activeTab === 'flota' && <FlotaPanel flota={flota} onFinalizar={finalizarViajeAdmin} />}
                {activeTab === 'historial' && <HistorialPanel historial={historial} cargando={cargandoHistorial} onRefresh={() => {
                    setCargandoHistorial(true);
                    fetch('/api/v1/viajes/historial', { headers: getHeaders() }).then(r => r.json()).then(h => setHistorial(h.data || [])).finally(() => setCargandoHistorial(false));
                }} />}
                {activeTab === 'rutas' && <RutasPanel getHeaders={getHeaders} />}
                {activeTab === 'buses' && <BusesPanel getHeaders={getHeaders} />}
                {activeTab === 'usuarios' && <UsuariosPanel getHeaders={getHeaders} currentUserId={auth.user.id} />}
            </main>
        </div>
    );
}

// ============================================================
// FLOTA (en vivo) — sin cambios funcionales
// ============================================================
function FlotaPanel({ flota, onFinalizar }: { flota: Record<string, any>; onFinalizar: (busId: string, placa: string) => void }) {
    return (
        <div className="flex-1 flex w-full h-full animate-fade-in flex-col md:flex-row">
            <aside className="w-full md:w-96 bg-white border-r border-gray-200 flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.05)] z-10 overflow-y-auto">
                <div className="p-5 bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                    <h2 className="font-black text-gray-800 text-lg flex items-center justify-between">
                        Unidades Activas
                        <span className="bg-blue-100 text-blue-700 py-1 px-3 rounded-full text-sm">{Object.keys(flota).length}</span>
                    </h2>
                </div>
                <div className="flex flex-col p-4 gap-4">
                    {Object.values(flota).map(bus => (
                        <div key={bus.id || bus.placa} className="border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow bg-white relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 group-hover:bg-blue-600 transition-colors"></div>
                            <div className="flex justify-between items-start mb-3">
                                <span className="font-black text-xl text-gray-900 tracking-tight">{bus.placa}</span>
                                <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider text-white shadow-sm ${bus.status === 'AT_STOP' ? 'bg-blue-500' : bus.status === 'DEPARTING' ? 'bg-orange-500' : bus.status === 'FULL' ? 'bg-red-600' : 'bg-green-500'}`}>{bus.status}</span>
                            </div>
                            <p className="text-sm text-gray-600 mb-4 font-medium flex items-center gap-2">
                                <span className="text-gray-400">📍</span> <span className="truncate">{bus.rutaNombre || 'Sin ruta'}</span>
                            </p>
                            <div className="w-full bg-gray-100 rounded-full h-2 mb-2 overflow-hidden border border-gray-200">
                                <div className={`h-full rounded-full transition-all duration-500 ${bus.aforoActual >= bus.capacidadMaxima ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${Math.min(100, (bus.aforoActual / bus.capacidadMaxima) * 100)}%` }}></div>
                            </div>
                            <div className="flex justify-between items-center text-xs mb-4">
                                <span className="text-gray-400 font-bold uppercase tracking-wider">Aforo</span>
                                <span className="font-black text-gray-700">{bus.aforoActual} / {bus.capacidadMaxima}</span>
                            </div>
                            <button onClick={() => onFinalizar(bus.id, bus.placa)} className="w-full bg-red-50 text-red-700 border border-red-200 font-bold text-xs uppercase tracking-wider py-2.5 rounded-lg hover:bg-red-100 transition-colors">
                                🏁 Finalizar viaje
                            </button>
                        </div>
                    ))}
                    {Object.keys(flota).length === 0 && (
                        <div className="text-center py-12 px-4">
                            <div className="text-4xl mb-3 opacity-30">🚏</div>
                            <p className="text-sm text-gray-500 font-medium">No hay unidades transmitiendo en vivo en este momento.</p>
                        </div>
                    )}
                </div>
            </aside>
            <div className="flex-1 relative z-0 min-h-[50vh] md:min-h-0 bg-gray-200">
                <MapContainer center={[-0.16667, -78.48778]} zoom={13} scrollWheelZoom={true} className="h-full w-full absolute inset-0">
                    <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" attribution='&copy; OpenStreetMap' />
                    {Object.values(flota).filter(bus => bus.lat && bus.lng).map(bus => (
                        <Marker key={bus.id || bus.placa} position={[bus.lat, bus.lng]}>
                            <Popup className="font-sans">
                                <div className="p-1">
                                    <strong className="text-lg font-black text-gray-900 block border-b border-gray-200 mb-2 pb-1">{bus.placa}</strong>
                                    <div className="space-y-1 text-sm text-gray-700">
                                        <p><span className="text-gray-400 mr-1">Ruta:</span> <span className="font-medium">{bus.rutaNombre}</span></p>
                                        <p><span className="text-gray-400 mr-1">Est:</span> <span className="font-bold text-blue-600">{bus.status}</span></p>
                                        <p><span className="text-gray-400 mr-1">Pax:</span> <span className="font-black">{bus.aforoActual}/{bus.capacidadMaxima}</span></p>
                                    </div>
                                </div>
                            </Popup>
                        </Marker>
                    ))}
                </MapContainer>
            </div>
        </div>
    );
}

// ============================================================
// HISTORIAL — sin cambios funcionales
// ============================================================
function HistorialPanel({ historial, cargando, onRefresh }: { historial: any[]; cargando: boolean; onRefresh: () => void }) {
    const estadoColor = (estado: string) => estado === 'COMPLETED' ? 'bg-green-100 text-green-700' : estado === 'ACTIVE' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600';
    return (
        <div className="flex-1 p-4 md:p-8 animate-fade-in overflow-y-auto bg-gray-50">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8 max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-8 border-b border-gray-100 pb-4">
                    <div>
                        <h2 className="text-2xl font-black text-gray-900 tracking-tight">Registro de Viajes</h2>
                        <p className="text-gray-500 text-sm mt-1 font-medium">Historial consolidado de la operativa intercampus</p>
                    </div>
                    <button onClick={onRefresh} className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2 px-4 rounded-lg transition-colors flex items-center gap-2 text-sm">↻ Actualizar</button>
                </div>
                {cargando ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-600 mb-4"></div>
                        <p className="text-gray-500 font-medium">Cargando registros del servidor...</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-widest border-b border-gray-200">
                                    <th className="p-5 font-black whitespace-nowrap">Inicio del Recorrido</th>
                                    <th className="p-5 font-black">Unidad</th>
                                    <th className="p-5 font-black">Trayecto</th>
                                    <th className="p-5 font-black">Operador</th>
                                    <th className="p-5 font-black text-center">Aforo Final</th>
                                    <th className="p-5 font-black text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm text-gray-700 divide-y divide-gray-100">
                                {historial.map(viaje => (
                                    <tr key={viaje.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="p-5 whitespace-nowrap font-medium text-gray-500">{viaje.inicio}</td>
                                        <td className="p-5 font-black text-gray-900 bg-gray-50/50">{viaje.placa}</td>
                                        <td className="p-5 font-medium">{viaje.ruta}</td>
                                        <td className="p-5">{viaje.conductor}</td>
                                        <td className="p-5 text-center font-black text-gray-900">{viaje.pasajeros}</td>
                                        <td className="p-5 text-center"><span className={`px-3 py-1 rounded-md text-xs font-black uppercase tracking-wider ${estadoColor(viaje.estado)}`}>{viaje.estado}</span></td>
                                    </tr>
                                ))}
                                {historial.length === 0 && (
                                    <tr><td colSpan={6} className="p-12 text-center text-gray-400 font-medium">No hay registros históricos disponibles.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================================
// Componentes reutilizables de formulario/feedback
// ============================================================
function Banner({ msg, tipo }: { msg: string; tipo: 'ok' | 'error' }) {
    if (!msg) return null;
    return <div className={`p-3 rounded-lg text-sm font-bold mb-4 border ${tipo === 'ok' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{msg}</div>;
}
const inputCls = 'w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 text-sm';
const btnPrimary = 'bg-gray-900 text-white font-bold py-2.5 px-5 rounded-lg hover:bg-gray-800 transition-colors text-sm disabled:opacity-50';
const card = 'bg-white rounded-2xl shadow-sm border border-gray-200 p-6';

// ============================================================
// RUTAS (CRUD + paradas)
// ============================================================
const RUTA_VACIA = { nombre: '', origen: '', destino: '', precio: '', horarioInicio: '', horarioFin: '' };

function RutasPanel({ getHeaders }: { getHeaders: Headers }) {
    const [rutas, setRutas] = useState<Ruta[]>([]);
    const [form, setForm] = useState<any>(RUTA_VACIA);
    const [editId, setEditId] = useState<string | null>(null);
    const [expandida, setExpandida] = useState<string | null>(null);
    const [msg, setMsg] = useState('');
    const [err, setErr] = useState('');
    const [guardando, setGuardando] = useState(false);

    const cargar = useCallback(() => {
        api<{ data: Ruta[] }>('/api/v1/rutas', getHeaders).then(r => setRutas(r.data || [])).catch(e => setErr(e.message));
    }, [getHeaders]);
    useEffect(() => { cargar(); }, [cargar]);

    const resetForm = () => { setForm(RUTA_VACIA); setEditId(null); };

    const guardar = async (e: React.FormEvent) => {
        e.preventDefault(); setErr(''); setMsg(''); setGuardando(true);
        try {
            const payload = {
                nombre: form.nombre, origen: form.origen, destino: form.destino,
                precio: Number(form.precio), horarioInicio: form.horarioInicio, horarioFin: form.horarioFin,
                ...(editId ? { activa: form.activa } : {}),
            };
            if (editId) {
                await api(`/api/v1/rutas/${editId}`, getHeaders, { method: 'PUT', body: JSON.stringify(payload) });
                setMsg('Ruta actualizada.');
            } else {
                await api('/api/v1/rutas', getHeaders, { method: 'POST', body: JSON.stringify(payload) });
                setMsg('Ruta creada.');
            }
            resetForm(); cargar();
        } catch (e: any) { setErr(e.message); } finally { setGuardando(false); }
    };

    const editar = (r: Ruta) => { setEditId(r.id); setForm({ nombre: r.nombre, origen: r.origen, destino: r.destino, precio: String(r.precio), horarioInicio: r.horarioInicio, horarioFin: r.horarioFin, activa: r.activa }); window.scrollTo(0, 0); };

    const desactivar = async (r: Ruta) => {
        if (!confirm(`¿Desactivar la ruta "${r.nombre}"?`)) return;
        setErr(''); setMsg('');
        try { await api(`/api/v1/rutas/${r.id}`, getHeaders, { method: 'DELETE' }); setMsg('Ruta desactivada.'); cargar(); }
        catch (e: any) { setErr(e.message); }
    };

    return (
        <div className="flex-1 p-4 md:p-8 overflow-y-auto bg-gray-50 animate-fade-in">
            <div className="max-w-6xl mx-auto space-y-6">
                <div className={card}>
                    <h2 className="text-xl font-black text-gray-900 mb-4">{editId ? 'Editar Ruta' : 'Nueva Ruta'}</h2>
                    <Banner msg={msg} tipo="ok" /><Banner msg={err} tipo="error" />
                    <form onSubmit={guardar} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <input className={inputCls} placeholder="Nombre" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required />
                        <input className={inputCls} placeholder="Origen" value={form.origen} onChange={e => setForm({ ...form, origen: e.target.value })} required />
                        <input className={inputCls} placeholder="Destino" value={form.destino} onChange={e => setForm({ ...form, destino: e.target.value })} required />
                        <input className={inputCls} type="number" step="0.01" placeholder="Precio" value={form.precio} onChange={e => setForm({ ...form, precio: e.target.value })} required />
                        <input className={inputCls} placeholder="Horario inicio (HH:MM)" value={form.horarioInicio} onChange={e => setForm({ ...form, horarioInicio: e.target.value })} required />
                        <input className={inputCls} placeholder="Horario fin (HH:MM)" value={form.horarioFin} onChange={e => setForm({ ...form, horarioFin: e.target.value })} required />
                        {editId && (
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700"><input type="checkbox" checked={!!form.activa} onChange={e => setForm({ ...form, activa: e.target.checked })} /> Activa</label>
                        )}
                        <div className="md:col-span-3 flex gap-3">
                            <button className={btnPrimary} disabled={guardando}>{editId ? 'Guardar cambios' : 'Crear ruta'}</button>
                            {editId && <button type="button" onClick={resetForm} className="text-sm font-bold text-gray-500 px-4">Cancelar</button>}
                        </div>
                    </form>
                </div>

                <div className={card}>
                    <h2 className="text-xl font-black text-gray-900 mb-4">Rutas ({rutas.length})</h2>
                    <div className="space-y-3">
                        {rutas.map(r => (
                            <div key={r.id} className="border border-gray-200 rounded-xl overflow-hidden">
                                <div className="flex items-center justify-between p-4 bg-white">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-black text-gray-900">{r.nombre}</span>
                                            {!r.activa && <span className="text-[10px] font-black uppercase bg-gray-200 text-gray-500 px-2 py-0.5 rounded">Inactiva</span>}
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5">{r.origen} → {r.destino} · ${r.precio} · {r.horarioInicio}-{r.horarioFin} · {r.paradas.length} paradas</p>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <button onClick={() => setExpandida(expandida === r.id ? null : r.id)} className="text-xs font-bold text-blue-600 hover:underline">Paradas</button>
                                        <button onClick={() => editar(r)} className="text-xs font-bold text-gray-700 hover:underline">Editar</button>
                                        {r.activa && <button onClick={() => desactivar(r)} className="text-xs font-bold text-red-600 hover:underline">Desactivar</button>}
                                    </div>
                                </div>
                                {expandida === r.id && <ParadasEditor ruta={r} getHeaders={getHeaders} onChange={cargar} />}
                            </div>
                        ))}
                        {rutas.length === 0 && <p className="text-sm text-gray-400 text-center py-6">Sin rutas registradas.</p>}
                    </div>
                </div>
            </div>
        </div>
    );
}

function ParadasEditor({ ruta, getHeaders, onChange }: { ruta: Ruta; getHeaders: Headers; onChange: () => void }) {
    const vacia = { nombre: '', latitud: '', longitud: '', orden: String(ruta.paradas.length + 1) };
    const [form, setForm] = useState<any>(vacia);
    const [editId, setEditId] = useState<string | null>(null);
    const [err, setErr] = useState('');

    const guardar = async (e: React.FormEvent) => {
        e.preventDefault(); setErr('');
        const payload = { nombre: form.nombre, latitud: Number(form.latitud), longitud: Number(form.longitud), orden: Number(form.orden) };
        try {
            if (editId) await api(`/api/v1/paradas/${editId}`, getHeaders, { method: 'PUT', body: JSON.stringify(payload) });
            else await api(`/api/v1/rutas/${ruta.id}/paradas`, getHeaders, { method: 'POST', body: JSON.stringify(payload) });
            setForm(vacia); setEditId(null); onChange();
        } catch (e: any) { setErr(e.message); }
    };

    return (
        <div className="bg-gray-50 border-t border-gray-200 p-4">
            <Banner msg={err} tipo="error" />
            <div className="space-y-1 mb-3">
                {ruta.paradas.map(p => (
                    <div key={p.id} className="flex items-center justify-between text-xs bg-white rounded-lg px-3 py-2 border border-gray-100">
                        <span><span className="font-black text-gray-700">#{p.orden}</span> {p.nombre} <span className="text-gray-400">({p.latitud.toFixed(5)}, {p.longitud.toFixed(5)})</span></span>
                        <button onClick={() => { setEditId(p.id); setForm({ nombre: p.nombre, latitud: String(p.latitud), longitud: String(p.longitud), orden: String(p.orden) }); }} className="font-bold text-gray-600 hover:underline">Editar</button>
                    </div>
                ))}
                {ruta.paradas.length === 0 && <p className="text-xs text-gray-400">Sin paradas.</p>}
            </div>
            <form onSubmit={guardar} className="grid grid-cols-2 md:grid-cols-5 gap-2 items-center">
                <input className={inputCls} placeholder="Nombre" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required />
                <input className={inputCls} type="number" step="any" placeholder="Latitud" value={form.latitud} onChange={e => setForm({ ...form, latitud: e.target.value })} required />
                <input className={inputCls} type="number" step="any" placeholder="Longitud" value={form.longitud} onChange={e => setForm({ ...form, longitud: e.target.value })} required />
                <input className={inputCls} type="number" placeholder="Orden" value={form.orden} onChange={e => setForm({ ...form, orden: e.target.value })} required />
                <button className={btnPrimary}>{editId ? 'Guardar' : 'Agregar'}</button>
            </form>
        </div>
    );
}

// ============================================================
// BUSES (listar, crear, asignar ruta)
// ============================================================
function BusesPanel({ getHeaders }: { getHeaders: Headers }) {
    const [buses, setBuses] = useState<Bus[]>([]);
    const [rutas, setRutas] = useState<Ruta[]>([]);
    const [placa, setPlaca] = useState('');
    const [capacidad, setCapacidad] = useState('');
    const [msg, setMsg] = useState('');
    const [err, setErr] = useState('');

    const cargar = useCallback(() => {
        api<{ data: Bus[] }>('/api/v1/buses', getHeaders).then(r => setBuses(r.data || [])).catch(e => setErr(e.message));
        api<{ data: Ruta[] }>('/api/v1/rutas?activa=true', getHeaders).then(r => setRutas(r.data || [])).catch(() => {});
    }, [getHeaders]);
    useEffect(() => { cargar(); }, [cargar]);

    const crear = async (e: React.FormEvent) => {
        e.preventDefault(); setErr(''); setMsg('');
        try {
            await api('/api/v1/buses', getHeaders, { method: 'POST', body: JSON.stringify({ placa, capacidadMaxima: Number(capacidad) }) });
            setMsg('Bus creado.'); setPlaca(''); setCapacidad(''); cargar();
        } catch (e: any) { setErr(e.message); }
    };

    const asignar = async (busId: string, rutaId: string) => {
        setErr(''); setMsg('');
        try { await api(`/api/v1/buses/${busId}/asignar`, getHeaders, { method: 'PUT', body: JSON.stringify({ rutaId }) }); setMsg('Ruta asignada.'); cargar(); }
        catch (e: any) { setErr(e.message); }
    };

    return (
        <div className="flex-1 p-4 md:p-8 overflow-y-auto bg-gray-50 animate-fade-in">
            <div className="max-w-5xl mx-auto space-y-6">
                <div className={card}>
                    <h2 className="text-xl font-black text-gray-900 mb-4">Nuevo Bus</h2>
                    <Banner msg={msg} tipo="ok" /><Banner msg={err} tipo="error" />
                    <form onSubmit={crear} className="flex flex-col md:flex-row gap-3">
                        <input className={inputCls} placeholder="Placa (ej. PBX-1234)" value={placa} onChange={e => setPlaca(e.target.value)} required />
                        <input className={inputCls} type="number" placeholder="Capacidad máxima" value={capacidad} onChange={e => setCapacidad(e.target.value)} required />
                        <button className={btnPrimary}>Crear bus</button>
                    </form>
                </div>
                <div className={card}>
                    <h2 className="text-xl font-black text-gray-900 mb-4">Buses ({buses.length})</h2>
                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-widest">
                                <tr><th className="p-4 font-black">Placa</th><th className="p-4 font-black">Capacidad</th><th className="p-4 font-black">Ruta asignada</th><th className="p-4 font-black">En vivo</th></tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {buses.map(b => (
                                    <tr key={b.id} className="hover:bg-gray-50">
                                        <td className="p-4 font-black text-gray-900">{b.placa}</td>
                                        <td className="p-4">{b.capacidadMaxima}</td>
                                        <td className="p-4">
                                            <select className={inputCls} value={b.rutaAsignada?.id || ''} onChange={e => asignar(b.id, e.target.value)}>
                                                <option value="" disabled>Sin asignar</option>
                                                {rutas.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                                            </select>
                                        </td>
                                        <td className="p-4">{b.estadoEnVivo ? <span className="text-green-600 font-bold">● Activo</span> : <span className="text-gray-400">○ Inactivo</span>}</td>
                                    </tr>
                                ))}
                                {buses.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-gray-400">Sin buses registrados.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================================================
// USUARIOS (CRUD)
// ============================================================
const ROLES = ['STUDENT', 'DRIVER', 'ADMIN'];

function UsuariosPanel({ getHeaders, currentUserId }: { getHeaders: Headers; currentUserId: string }) {
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [form, setForm] = useState({ nombre: '', email: '', password: '', rol: 'STUDENT' });
    const [msg, setMsg] = useState('');
    const [err, setErr] = useState('');

    const cargar = useCallback(() => {
        api<{ data: Usuario[] }>('/api/v1/usuarios', getHeaders).then(r => setUsuarios(r.data || [])).catch(e => setErr(e.message));
    }, [getHeaders]);
    useEffect(() => { cargar(); }, [cargar]);

    const crear = async (e: React.FormEvent) => {
        e.preventDefault(); setErr(''); setMsg('');
        try {
            await api('/api/v1/usuarios/registro', getHeaders, { method: 'POST', body: JSON.stringify(form) });
            setMsg('Usuario creado.'); setForm({ nombre: '', email: '', password: '', rol: 'STUDENT' }); cargar();
        } catch (e: any) { setErr(e.message); }
    };

    const cambiarRol = async (u: Usuario, rol: string) => {
        setErr(''); setMsg('');
        try { await api(`/api/v1/usuarios/${u.id}`, getHeaders, { method: 'PUT', body: JSON.stringify({ rol }) }); setMsg(`Rol de ${u.nombre} actualizado.`); cargar(); }
        catch (e: any) { setErr(e.message); }
    };

    const eliminar = async (u: Usuario) => {
        if (!confirm(`¿Eliminar a ${u.nombre} (${u.email})?`)) return;
        setErr(''); setMsg('');
        try { await api(`/api/v1/usuarios/${u.id}`, getHeaders, { method: 'DELETE' }); setMsg('Usuario eliminado.'); cargar(); }
        catch (e: any) { setErr(e.message); }
    };

    return (
        <div className="flex-1 p-4 md:p-8 overflow-y-auto bg-gray-50 animate-fade-in">
            <div className="max-w-5xl mx-auto space-y-6">
                <div className={card}>
                    <h2 className="text-xl font-black text-gray-900 mb-4">Nuevo Usuario</h2>
                    <Banner msg={msg} tipo="ok" /><Banner msg={err} tipo="error" />
                    <form onSubmit={crear} className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <input className={inputCls} placeholder="Nombre" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required />
                        <input className={inputCls} type="email" placeholder="Correo @udla.edu.ec" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
                        <input className={inputCls} type="password" placeholder="Contraseña (mín. 8)" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
                        <select className={inputCls} value={form.rol} onChange={e => setForm({ ...form, rol: e.target.value })}>
                            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <div className="md:col-span-4"><button className={btnPrimary}>Crear usuario</button></div>
                    </form>
                </div>
                <div className={card}>
                    <h2 className="text-xl font-black text-gray-900 mb-4">Usuarios ({usuarios.length})</h2>
                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-widest">
                                <tr><th className="p-4 font-black">Nombre</th><th className="p-4 font-black">Correo</th><th className="p-4 font-black">Rol</th><th className="p-4 font-black text-right">Acciones</th></tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {usuarios.map(u => (
                                    <tr key={u.id} className="hover:bg-gray-50">
                                        <td className="p-4 font-bold text-gray-900">{u.nombre}</td>
                                        <td className="p-4 text-gray-600">{u.email}</td>
                                        <td className="p-4">
                                            <select className={inputCls} value={u.rol} onChange={e => cambiarRol(u, e.target.value)} disabled={u.id === currentUserId}>
                                                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                            </select>
                                        </td>
                                        <td className="p-4 text-right">
                                            {u.id === currentUserId
                                                ? <span className="text-xs text-gray-400 font-medium">Tú</span>
                                                : <button onClick={() => eliminar(u)} className="text-xs font-bold text-red-600 hover:underline">Eliminar</button>}
                                        </td>
                                    </tr>
                                ))}
                                {usuarios.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-gray-400">Sin usuarios.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
