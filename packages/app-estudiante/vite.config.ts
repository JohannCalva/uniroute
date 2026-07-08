import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            manifest: {
                name: 'UniRoute Estudiante',
                short_name: 'UniRoute',
                description: 'Monitoreo de buses intercampus UDLA en tiempo real',
                theme_color: '#b91c1c', // bg-red-700
                background_color: '#f9fafb', // bg-gray-50
                display: 'standalone',
                orientation: 'portrait',
                // scope/start_url deben coincidir con el prefijo que sirve nginx.
                scope: '/estudiante/',
                start_url: '/estudiante/',
                // Iconos propios servidos por la app (reemplazables por el logo real de la UDLA).
                icons: [
                    { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
                    { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
                    { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ]
            }
        })
    ],
    base: '/estudiante/',
    server: {
        host: '0.0.0.0',
        port: 5173,
        hmr: false,
        fs: {
            // CRÍTICO: Permite a Vite leer la carpeta packages/shared
            allow: ['../..']
        }
    }

});