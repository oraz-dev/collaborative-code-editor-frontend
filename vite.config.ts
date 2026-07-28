import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import svgr from 'vite-plugin-svgr';

/**
 * Both backend services are plain HTTP and send no CORS headers at all
 * (an OPTIONS preflight 404s), so the browser cannot call them directly.
 * We proxy them under the dev origin instead, which also lets the
 * `Secure` refresh cookie be stored — localhost counts as a trustworthy
 * origin, so the cookie survives even though the upstream is http://.
 *
 * /api/auth/* -> auth service     (:8080/auth/*)
 * /api/v1/*   -> document service (:80/api/v1/*), including the ws upgrade
 */
const AUTH_TARGET = process.env.VITE_AUTH_TARGET ?? 'http://31.57.26.155:8080';
const DOCS_TARGET = process.env.VITE_DOCS_TARGET ?? 'http://31.57.26.155';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    svgr()
  ],
  resolve: {
    alias: {
      '@': '/src'
    }
  },
  server: {
    proxy: {
      '/api/auth': {
        target: AUTH_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/auth/, '/auth'),
      },
      '/api/v1': {
        target: DOCS_TARGET,
        changeOrigin: true,
        // the collaboration socket lives at /api/v1/documents/:id/ws
        ws: true,
      },
    },
  },
})
