import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { writeDashboard } from './scripts/build-dashboard.mjs';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

export default defineConfig(async ({ command }) => {
const rawPort = process.env.PORT || (command === 'build' ? '3000' : undefined);

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || (command === 'build' ? '/' : undefined);

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

// Keeps the website and the owner dashboard on one menu: regenerates /dashboard from src/data/menu.json
// and publishes that file as /menu.json.
function siteSync(): Plugin {
  const menuPath = path.resolve(import.meta.dirname, 'src/data/menu.json');
  return {
    name: 'site-sync',
    buildStart() { writeDashboard(); },
    configureServer(server) {
      writeDashboard();
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] === '/menu.json') { res.setHeader('content-type', 'application/json'); res.end(readFileSync(menuPath)); return; }
        next();
      });
    },
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'menu.json', source: readFileSync(menuPath, 'utf8') }); },
  };
}

  // Static builds do not require a workflow port.
  return {
  base: basePath,
  plugins: [
    siteSync(),
    react(),
    tailwindcss({ optimize: false }),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
  };
});
