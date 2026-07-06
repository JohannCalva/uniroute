import { useState, useEffect } from 'react';
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

export default function App() {
    const [auth, setAuth] = useState<AuthData>(() => {
        const stored = localStorage.getItem('uniroute_admin_auth');
        return stored ? JSON.parse(stored) : null;
    });

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errorLogin, setErrorLogin] = useState('');

    const [activeTab, setActiveTab] = useState<'flota' | 'historial'>('flota');
    const [flota, setFlota] = useState<Record<string, any>>({});
    const [historial, setHistorial] = useState<any[]>([]);
    const [cargandoHistorial, setCargandoHistorial] = useState(false);

    const getHeaders = () => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth?.token}` });

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorLogin('');
        try {
            const res = await fetch('/api/v1/usuarios/login', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (res.ok) {
                if (data.user.rol !== 'ADMIN') return setErrorLogin('Acceso denegado. Rol ADMIN requerido.');
                setAuth(data); localStorage.setItem('uniroute_admin_auth', JSON.stringify(data));
            } else { setErrorLogin('Credenciales inválidas'); }
        } catch { setErrorLogin('Error de red'); }
    };

    const handleLogout = () => { setAuth(null); localStorage.removeItem('uniroute_admin_auth'); };

    useEffect(() => {
        if (!auth) return;
        if (activeTab === 'flota') {
            fetch('/api/v1/buses', { headers: getHeaders() })
                .then(r => r.json())
                .then(data => {
                    const mapBuses: any = {};
                    (data.data || []).forEach((b: any) => {
                        if (b.estadoEnVivo) {
                            mapBuses[b.id] = { ...b.estadoEnVivo, placa: b.placa, rutaNombre: b.rutaAsignada?.nombre, capacidadMaxima: b.capacidadMaxima };
                        }
                    });
                    setFlota(mapBuses);
                });

            const socket: Socket = io('/', { path: '/socket.io/', transports: ['websocket'] });
            socket.on('connect', () => socket.emit('subscribe:admin'));
            socket.on('bus:gps', (d) => setFlota(p => p[d.busId] ? { ...p, [d.busId]: { ...p[d.busId], lat: d.payload.latitude, lng: d.payload.longitude } } : p));
            socket.on('bus:status', (d) => setFlota(p => p[d.busId] ? { ...p, [d.busId]: { ...p[d.busId], status: d.payload.newStatus } } : p));
            socket.on('bus:aforo', (d) => setFlota(p => p[d.busId] ? { ...p, [d.busId]: { ...p[d.busId], aforoActual: d.payload.aforoActual } } : p));
            return () => { socket.disconnect(); };
        } else {
            setCargandoHistorial(true);
            fetch('/api/v1/viajes/historial', { headers: getHeaders() })
                .then(r => r.json())
                .then(data => setHistorial(data.data || []))
                .finally(() => setCargandoHistorial(false));
        }
    }, [auth, activeTab]);

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

            <nav className="bg-white border-b border-gray-200 flex shadow-sm z-10">
                <button onClick={() => setActiveTab('flota')} className={`py-4 px-8 text-sm font-black uppercase tracking-widest transition-colors ${activeTab === 'flota' ? 'border-b-4 border-red-600 text-gray-900 bg-gray-50' : 'border-b-4 border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}>📡 Mapa de Flota</button>
                <button onClick={() => setActiveTab('historial')} className={`py-4 px-8 text-sm font-black uppercase tracking-widest transition-colors ${activeTab === 'historial' ? 'border-b-4 border-red-600 text-gray-900 bg-gray-50' : 'border-b-4 border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}>📊 Historial</button>
            </nav>

            <main className="flex-1 flex overflow-hidden">
                {activeTab === 'flota' && (
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
                                            <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider text-white shadow-sm
                                                ${bus.status === 'AT_STOP' ? 'bg-blue-500' :
                                                bus.status === 'DEPARTING' ? 'bg-orange-500' :
                                                    bus.status === 'FULL' ? 'bg-red-600' : 'bg-green-500'}`}
                                            >
                                                {bus.status}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-600 mb-4 font-medium flex items-center gap-2">
                                            <span className="text-gray-400">📍</span> <span className="truncate">{bus.rutaNombre || 'Sin ruta'}</span>
                                        </p>
                                        <div className="w-full bg-gray-100 rounded-full h-2 mb-2 overflow-hidden border border-gray-200">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${bus.aforoActual >= bus.capacidadMaxima ? 'bg-red-500' : 'bg-green-500'}`}
                                                style={{ width: `${Math.min(100, (bus.aforoActual / bus.capacidadMaxima) * 100)}%` }}
                                            ></div>
                                        </div>
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-gray-400 font-bold uppercase tracking-wider">Aforo</span>
                                            <span className="font-black text-gray-700">{bus.aforoActual} / {bus.capacidadMaxima}</span>
                                        </div>
                                    </div>
                                ))}
                                {Object.keys(flota).length === 0 && (
                                    <div className="text-center py-12 px-4">
                                        <div className="text-4xl mb-3 opacity-30">🚓</div>
                                        <p className="text-sm text-gray-500 font-medium">No hay unidades transmitiendo en vivo en este momento.</p>
                                    </div>
                                )}
                            </div>
                        </aside>

                        <div className="flex-1 relative z-0 min-h-[50vh] md:min-h-0 bg-gray-200">
                            <MapContainer
                                center={[-0.16667, -78.48778]}
                                zoom={13}
                                scrollWheelZoom={true}
                                className="h-full w-full absolute inset-0"
                            >
                                <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" attribution='&copy; OpenStreetMap' />
                                {Object.values(flota).map(bus => (
                                    <Marker key={bus.id || bus.placa} position={[bus.lat || 0, bus.lng || 0]}>
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
                )}

                {activeTab === 'historial' && (
                    <div className="flex-1 p-4 md:p-8 animate-fade-in overflow-y-auto bg-gray-50">
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8 max-w-7xl mx-auto">
                            <div className="flex justify-between items-center mb-8 border-b border-gray-100 pb-4">
                                <div>
                                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">Registro de Viajes</h2>
                                    <p className="text-gray-500 text-sm mt-1 font-medium">Historial consolidado de la operativa intercampus</p>
                                </div>
                                <button onClick={() => {
                                    setCargandoHistorial(true);
                                    fetch('/api/v1/viajes/historial', { headers: getHeaders() })
                                        .then(r => r.json()).then(d => setHistorial(d.data || [])).finally(() => setCargandoHistorial(false));
                                }} className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2 px-4 rounded-lg transition-colors flex items-center gap-2 text-sm">
                                    ↻ Actualizar
                                </button>
                            </div>

                            {cargandoHistorial ? (
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
                                                <td className="p-5 text-center">
                                                        <span className="px-3 py-1 bg-green-100 text-green-700 rounded-md text-xs font-black uppercase tracking-wider">
                                                            {viaje.estado}
                                                        </span>
                                                </td>
                                            </tr>
                                        ))}
                                        {historial.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="p-12 text-center text-gray-400 font-medium">
                                                    No hay registros históricos disponibles.
                                                </td>
                                            </tr>
                                        )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}