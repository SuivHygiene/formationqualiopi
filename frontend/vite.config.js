import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Le build est déposé dans ../public (racine web), à côté de public/api (PHP).
export default defineConfig({
  root: resolve(__dirname),
  base: '/',
  build: {
    outDir: resolve(__dirname, '../public'),
    emptyOutDir: false,
    rollupOptions: {
      input: {
        app: resolve(__dirname, 'index.html'),
        stagiaire: resolve(__dirname, 'stagiaire.html'),
        document: resolve(__dirname, 'document.html'),
        verification: resolve(__dirname, 'verification.html'),
      },
    },
  },
  server: {
    proxy: { '/api': 'http://127.0.0.1:8080' },
  },
  test: { environment: 'jsdom' },
});
