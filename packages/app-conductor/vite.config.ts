import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            // El scope/base debe coincidir con el prefijo servido por nginx.
            manifest: {
                name: 'UniRoute Conductor',
                short_name: 'Conductor',
                description: 'Panel del conductor UniRoute — estado del bus, GPS y escaneo QR',
                theme_color: '#b91c1c',
                background_color: '#f3f4f6',
                display: 'standalone',
                orientation: 'portrait',
                scope: '/conductor/',
                start_url: '/conductor/',
                icons: [
                    { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
                    { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
                    { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
            },
        }),
    ],
    server: {
        port: 5174,
        host: '0.0.0.0',
    },
    base: '/conductor/',
});

