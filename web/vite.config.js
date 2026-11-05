import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run dev` serves the UI on 5173 and forwards API calls to the Express server on 3000.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/oauth2callback': 'http://localhost:3000',
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
