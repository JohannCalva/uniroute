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
                icons: [
                    {
                        // Para producción, aquí pondrías el logo de la UDLA o del proyecto
                        src: 'hhttps://www.udla.edu.ec/assets/logo_new.svg',
                        sizes: '512x512',
                        type: 'image/png'
                    }
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