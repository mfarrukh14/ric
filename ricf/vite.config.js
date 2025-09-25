import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    host: '0.0.0.0',   // listen on all IPs
    port: 5173,        // or whichever port you want
  },
})
