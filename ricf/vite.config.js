import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
        host: '0.0.0.0', // reachable from other machines on the network
        port: 5100,
    },
    build: {
        rollupOptions: {
            output: {
                // Long-lived vendor chunks cache across deploys; screens load on demand.
                manualChunks(id) {
                    if (!id.includes('node_modules')) return undefined;
                    if (/[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'react';
                    if (/[\\/](recharts|d3-[^\\/]+|victory-vendor)[\\/]/.test(id)) return 'charts';
                    if (/[\\/]xlsx[\\/]/.test(id)) return 'sheets';
                    return undefined;
                },
            },
        },
    },
});
