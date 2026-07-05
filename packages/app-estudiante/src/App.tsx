import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { io, Socket } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';

// @ts-ignore
import icon from 'leaflet/dist/images/marker-icon.png';
// @ts-ignore
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
});
L.Marker.prototype.options.icon = DefaultIcon;

type Stop = { id: string; nombre: string; latitud: number; longitud: number; orden: number; };
type Route = { id: string; nombre: string; origen: string; destino: string; horarioInicio: string; horarioFin: string; paradas: Stop[]; };
type Notificacion = { id: string; mensaje: string; tipo: 'warning' | 'error' | 'info' };
type AuthData = { token: string; user: { id: string; nombre: string; email: string; rol: string } } | null;

export default function App() {
    const [auth, setAuth] = useState<AuthData>(() => {
        const stored = localStorage.getItem('uniroute_estudiante');
        return stored ? JSON.parse(stored) : null;
    });

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errorLogin, setErrorLogin] = useState('');

    const [activeTab, setActiveTab] = useState<'mapa' | 'qr'>('mapa');
    const [rutas, setRutas] = useState<Route[]>([]);
    const [rutaSeleccionada, setRutaSeleccionada] = useState<Route | null>(null);
    const [cargando, setCargando] = useState(false);
    const [busesActivos, setBusesActivos] = useState<Record<string, { lat: number, lng: number }>>({});
    const [boardingToken, setBoardingToken] = useState<string>('');
    const [enviandoAlerta, setEnviandoAlerta] = useState(false);
    const [alertaEnviada, setAlertaEnviada] = useState(false);
    const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);

    const getHeaders = () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth?.token}`
    });

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorLogin('');
        try {
            const res = await fetch('/api/v1/usuarios/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (res.ok) {
                if (data.user.rol !== 'STUDENT') {
                    return setErrorLogin("Esta aplicación es exclusiva para estudiantes.");
                }
                setAuth(data);
                localStorage.setItem('uniroute_estudiante', JSON.stringify(data));
            } else {
                setErrorLogin(data.error || 'Credenciales inválidas');
            }
        } catch {
            setErrorLogin('Error conectando al servidor');
        }
    };

    const handleLogout = () => {
        setAuth(null);
        localStorage.removeItem('uniroute_estudiante');
        setRutaSeleccionada(null);
    };

    const dispararNotificacion = (mensaje: string, tipo: 'warning' | 'error' | 'info') => {
        const id = Math.random().toString(36).substring(7);
        setNotificaciones(prev => [...prev, { id, mensaje, tipo }]);
        setTimeout(() => setNotificaciones(prev => prev.filter(n => n.id !== id)), 5000);
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('UniRoute', { body: mensaje });
        }
    };

    useEffect(() => {
        if (!auth) return;
        setCargando(true);
        fetch('/api/v1/rutas?activa=true', { headers: getHeaders() })
            .then(res => res.json())
            .then(data => {
                if (data?.data) setRutas(data.data);
                setCargando(false);
            }).catch(() => setCargando(false));

        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, [auth]);

    useEffect(() => {
        if (!auth || activeTab !== 'qr') return;
        fetch('/api/v1/usuarios/me/boarding-token', { headers: getHeaders() })
            .then(res => res.json())
            .then(data => { if (data.boardingToken) setBoardingToken(data.boardingToken); })
            .catch(console.error);
    }, [auth, activeTab]);

    useEffect(() => {
        if (!rutaSeleccionada || !auth) return;
        setBusesActivos({});
        const socket: Socket = io('/', { path: '/socket.io/', transports: ['websocket'] });

        socket.on('connect', () => socket.emit('subscribe:route', { routeId: rutaSeleccionada.id }));

        socket.on('bus:gps', (data) => {
            setBusesActivos(prev => ({
                ...prev,
                [data.busId]: { lat: data.payload.latitude, lng: data.payload.longitude }
            }));
        });

        socket.on('bus:status', (data) => {
            const status = data.payload.newStatus;
            if (status === 'DEPARTING') dispararNotificacion("¡El bus sale en 5 minutos!", "warning");
            else if (status === 'FULL') dispararNotificacion("BUS LLENO - Busca otra unidad.", "error");
            else if (status === 'ARRIVED') dispararNotificacion("El bus ha llegado a su destino.", "info");
        });

        return () => {
            socket.emit('unsubscribe:route', rutaSeleccionada.id);
            socket.disconnect();
        };
    }, [rutaSeleccionada, auth]);

    const handleEstoyLlegando = () => {
        if (!rutaSeleccionada || !navigator.geolocation) return;
        setEnviandoAlerta(true);
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    await fetch('/api/v1/despachos/proximidad', {
                        method: 'POST',
                        headers: getHeaders(),
                        body: JSON.stringify({ rutaId: rutaSeleccionada.id, latitude: position.coords.latitude, longitude: position.coords.longitude })
                    });
                    setAlertaEnviada(true);
                    setTimeout(() => setAlertaEnviada(false), 5000);
                } finally { setEnviandoAlerta(false); }
            },
            () => { alert("Permite el acceso a tu ubicación."); setEnviandoAlerta(false); }
        );
    };

    if (!auth) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <form onSubmit={handleLogin} className="bg-white p-8 rounded-xl shadow-md max-w-sm w-full border border-gray-200">
                    <h1 className="text-2xl font-bold text-red-700 mb-6 text-center">UniRoute Estudiante</h1>
                    {errorLogin && <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm font-semibold">{errorLogin}</div>}
                    <input type="email" placeholder="Correo @udla.edu.ec" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-3 mb-4 border rounded focus:ring-2 focus:ring-red-500 outline-none" required />
                    <input type="password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 mb-6 border rounded focus:ring-2 focus:ring-red-500 outline-none" required />
                    <button type="submit" className="w-full bg-red-700 text-white font-bold py-3 rounded-lg hover:bg-red-800 transition">Iniciar Sesión</button>
                </form>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col bg-gray-50 relative">
            <div className="fixed top-4 left-0 right-0 z-[1000] flex flex-col items-center gap-2 pointer-events-none px-4">
                {notificaciones.map(noti => (
                    <div key={noti.id} className={`px-4 py-3 rounded-lg shadow-lg text-white font-semibold text-sm max-w-sm w-full text-center pointer-events-auto transition-all ${noti.tipo === 'warning' ? 'bg-orange-500' : noti.tipo === 'error' ? 'bg-red-600' : 'bg-blue-600'}`}>
                        {noti.tipo === 'warning' && '⚠️ '}
                        {noti.tipo === 'error' && '🚫 '}
                        {noti.tipo === 'info' && 'ℹ️ '}
                        {noti.mensaje}
                    </div>
                ))}
            </div>

            <header className="bg-red-700 text-white p-4 shadow-md flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <h1 className="text-xl font-bold tracking-tight">UniRoute</h1>
                    <span className="bg-red-800 px-3 py-1 rounded-full text-xs font-medium border border-red-600">Estudiante</span>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-sm opacity-90 hidden sm:inline">{auth.user.nombre}</span>
                    <button onClick={handleLogout} className="text-xs bg-red-800 hover:bg-red-900 px-3 py-1 rounded border border-red-600 transition-colors">Salir</button>
                </div>
            </header>

            <nav className="bg-white border-b border-gray-200 shadow-sm">
                <div className="container mx-auto flex max-w-md">
                    <button onClick={() => setActiveTab('mapa')} className={`flex-1 py-3 text-sm font-semibold transition-colors border-b-2 ${activeTab === 'mapa' ? 'border-red-600 text-red-700' : 'border-transparent text-gray-500'}`}>Rutas y Mapa</button>
                    <button onClick={() => setActiveTab('qr')} className={`flex-1 py-3 text-sm font-semibold transition-colors border-b-2 ${activeTab === 'qr' ? 'border-red-600 text-red-700' : 'border-transparent text-gray-500'}`}>Pase de Abordaje</button>
                </div>
            </nav>

            <main className="flex-1 container mx-auto p-4 max-w-md">
                {activeTab === 'mapa' && (
                    <div className="animate-fade-in">
                        <section className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-4">
                            {cargando ? <p className="text-center text-gray-500">Cargando rutas...</p> : (
                                <select className="w-full p-3 bg-gray-50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" onChange={(e) => setRutaSeleccionada(rutas.find(r => r.id === e.target.value) || null)} value={rutaSeleccionada?.id || ""}>
                                    <option value="" disabled>Selecciona un trayecto...</option>
                                    {rutas.map(ruta => <option key={ruta.id} value={ruta.id}>{ruta.nombre} ({ruta.horarioInicio} - {ruta.horarioFin})</option>)}
                                </select>
                            )}
                        </section>

                        {rutaSeleccionada ? (
                            <article className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
                                <div className="p-5 pb-3">
                                    <h3 className="font-bold text-xl text-red-700 mb-1">{rutaSeleccionada.nombre}</h3>
                                    <p className="text-sm text-gray-600 mb-3"><span className="font-medium">Destino:</span> {rutaSeleccionada.destino}</p>
                                </div>
                                <div className="px-5 pb-4 border-b border-gray-100">
                                    <button onClick={handleEstoyLlegando} disabled={enviandoAlerta || alertaEnviada} className={`w-full py-3 rounded-lg font-bold text-white transition-all flex justify-center items-center gap-2 ${alertaEnviada ? 'bg-green-500' : 'bg-orange-500 hover:bg-orange-600'} ${enviandoAlerta ? 'opacity-70 cursor-not-allowed' : ''}`}>
                                        {enviandoAlerta ? '📍 Obteniendo ubicación...' : alertaEnviada ? '✅ ¡El conductor ya sabe que vas!' : '🏃‍♂️ ¡Estoy llegando!'}
                                    </button>
                                </div>
                                <div className="h-72 w-full bg-gray-100 relative z-0">
                                    {rutaSeleccionada.paradas && rutaSeleccionada.paradas.length > 0 && (
                                        <MapContainer key={rutaSeleccionada.id} center={[rutaSeleccionada.paradas[0].latitud, rutaSeleccionada.paradas[0].longitud]} zoom={14} scrollWheelZoom={false} className="h-full w-full">
                                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                            {rutaSeleccionada.paradas.map(parada => <Marker key={parada.id} position={[parada.latitud, parada.longitud]}><Popup><strong>{parada.nombre}</strong></Popup></Marker>)}
                                            {Object.entries(busesActivos).map(([id, coords]) => <Marker key={id} position={[coords.lat, coords.lng]}><Popup>🚌 Bus en Ruta</Popup></Marker>)}
                                        </MapContainer>
                                    )}
                                </div>
                            </article>
                        ) : <section className="text-center text-gray-500 mt-10 p-6 bg-gray-100/50 rounded-xl border border-dashed border-gray-300">Selecciona una ruta para monitorear el mapa.</section>}
                    </div>
                )}
                {activeTab === 'qr' && (
                    <div className="animate-fade-in flex flex-col items-center justify-center py-8">
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 flex flex-col items-center max-w-sm w-full">
                            <h2 className="text-2xl font-bold text-gray-800 mb-2">Tu Pase de Abordaje</h2>
                            <p className="text-sm text-gray-500 text-center mb-6">Muestra este código al conductor al subir al bus.</p>
                            <div className="bg-white p-4 rounded-xl border-4 border-red-50 mb-6">
                                {boardingToken ? <QRCodeSVG value={boardingToken} size={200} level="H" fgColor="#1f2937" /> : <p className="text-gray-400 font-medium">Generando QR...</p>}
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}