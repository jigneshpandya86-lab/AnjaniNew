import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: 'index.html',
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/firestore'],
          sentry: ['@sentry/browser'],
        }
      }
    }
  },
  server: {
    port: 5173,
    open: true
  }
});
