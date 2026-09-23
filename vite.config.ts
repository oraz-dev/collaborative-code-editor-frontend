import { defineConfig, type ProxyOptions } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import svgr from 'vite-plugin-svgr';

/**
 * Both services are plain HTTP, so they are proxied under the dev origin. That
 * keeps requests same-origin and lets the `Secure` refresh cookie be stored —
 * localhost counts as a trustworthy origin even over http://.
 *
 * /api/auth/* -> auth service ROOT (:8080/*), not :8080/auth/*. The service
 *                mounts sessions under /auth/… but user lookup at /users, so
 *                the prefix is stripped entirely and callers pass the full
 *                upstream path.
 * /api/v1/*   -> document service (:80/api/v1/*), including the ws upgrade
 */
const AUTH_TARGET = process.env.VITE_AUTH_TARGET ?? 'http://31.57.26.155:8080';
const DOCS_TARGET = process.env.VITE_DOCS_TARGET ?? 'http://31.57.26.155';
/*
 * The assistant is the one path that does not go to a backend service: the
 * OpenRouter key lives in the deployed site's proxy, and a dev server has
 * none of its own, so `pnpm dev` borrows the deployed one. The session token
 * is issued by the same auth service either way, which is what that proxy
 * checks before it adds the key.
 */
const AI_TARGET = process.env.VITE_AI_TARGET ?? 'https://space.31.57.26.155.nip.io';

/**
 * Both services allowlist the `Origin` header and reject anything unrecognised
 * with a **bodyless 403** — only `http://localhost:3000` and
 * `http://localhost:5173` are accepted. So the moment Vite picks a different
 * port (because 3000 was taken, say), every single request fails with an
 * opaque error and the app looks broken.
 *
 * The browser-to-proxy hop is already same-origin, so the header carries no
 * meaning upstream. Dropping it puts the request in the "no Origin" case,
 * which both services accept, and the dev server then works on any port.
 */
const stripOrigin: ProxyOptions['configure'] = (proxy) => {
  proxy.on('proxyReq', (proxyReq) => {
    proxyReq.removeHeader('origin');
  });

  // A websocket upgrade does NOT go through 'proxyReq' — it has its own event.
  // Without this the collaboration socket still leaks the browser's Origin and
  // the handshake is refused with 403, which the editor shows as a permanent
  // "Reconnecting…".
  proxy.on('proxyReqWs', (proxyReq) => {
    proxyReq.removeHeader('origin');
  });
};

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
        rewrite: (path) => path.replace(/^\/api\/auth/, ''),
        configure: stripOrigin,
      },
      '/api/ai': {
        target: AI_TARGET,
        changeOrigin: true,
        configure: stripOrigin,
      },
      '/api/v1': {
        target: DOCS_TARGET,
        changeOrigin: true,
        // the collaboration socket lives at /api/v1/documents/:id/ws
        ws: true,
        configure: stripOrigin,
      },
    },
  },
})
